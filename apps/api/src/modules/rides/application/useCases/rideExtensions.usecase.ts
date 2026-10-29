import type {
  GeoPoint,
  RideExtensionProposalDto,
  StateDistanceBreakdown,
  ZoneClassificationType,
} from '@cabzone/contracts';
import { decodePolyline, haversineDistanceM, isPointInIndia } from '@cabzone/geo';
import { AppError } from '../../../../shared/errors/AppError.js';
import { newUuid } from '../../../../shared/ids.js';
import type { UnitOfWorkPort } from '../../../../shared/db/unitOfWork.port.js';
import {
  calculateStateDistanceBreakdown,
  type RouteRequest,
  type RouteResult,
} from '../../../routing/routing.public.js';
import type {
  RideEntity,
  RideRepositoryPort,
  RideEventRepositoryPort,
} from '../../domain/index.js';
import { saveRideTransition } from '../rideTransition.js';

type ExtensionZone = RideExtensionProposalDto['zone'];
export interface RideExtensionsDeps {
  rideRepo: RideRepositoryPort;
  rideEventRepo: RideEventRepositoryPort;
  unitOfWork: UnitOfWorkPort;
  routing: { execute(input: RouteRequest): Promise<RouteResult> };
  getDriverLocation(driverId: string): Promise<(GeoPoint & { updatedAt: Date }) | null>;
  classify(
    origin: GeoPoint,
    destination: GeoPoint,
    vehicleCategory: RideEntity['vehicleCategory'],
  ): Promise<ExtensionZone>;
  segmentRoute?: typeof calculateStateDistanceBreakdown;
  now?: () => Date;
}

export class RideExtensionsUseCase {
  constructor(private readonly deps: RideExtensionsDeps) {}
  private now() {
    return this.deps.now?.() ?? new Date();
  }

  async propose(input: {
    rideId: string;
    riderId: string;
    requestId: string;
    newDrop: RideEntity['drop'];
  }): Promise<RideEntity> {
    const ride = await this.deps.rideRepo.findById(input.rideId);
    if (!ride || ride.bookerRiderId !== input.riderId) throw AppError.notFound('RIDE_NOT_FOUND');
    const previous = ride.extensionProposal;
    if (previous?.requestId === input.requestId) {
      if (JSON.stringify(previous.newDrop) !== JSON.stringify(input.newDrop))
        throw AppError.conflict('EXTENSION_REQUEST_REUSED');
      return ride;
    }
    const events = await this.deps.rideEventRepo.findByRideId(ride.id);
    if (
      events.some(
        (e) => e.eventType === 'EXTENSION_REQUESTED' && e.metadata.requestId === input.requestId,
      )
    )
      throw AppError.conflict('EXTENSION_ALREADY_PROCESSED: Refresh the trip.');
    if (ride.status !== 'TRIP_STARTED' || !ride.driverId)
      throw AppError.conflict('EXTENSION_REQUIRES_ACTIVE_TRIP');
    if (previous?.status === 'REQUESTED' && Date.parse(previous.expiresAt) > this.now().getTime())
      throw AppError.conflict('EXTENSION_PENDING: Wait for the driver to respond.');
    if (!isPointInIndia(input.newDrop).inside) throw AppError.badRequest('OUTSIDE_INDIA');
    const location = await this.deps.getDriverLocation(ride.driverId);
    const age = location ? this.now().getTime() - location.updatedAt.getTime() : Infinity;
    if (
      !location ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > 60000 ||
      !Number.isFinite(location.lat) ||
      !Number.isFinite(location.lng) ||
      !isPointInIndia(location).inside
    )
      throw AppError.conflict('DRIVER_LOCATION_STALE: A fresh GPS fix is required.');
    const [oldRoute, newRoute, fullRoute, zone] = await Promise.all([
      this.deps.routing.execute({
        origin: location,
        destination: ride.drop,
        vehicleCategory: ride.vehicleCategory,
      }),
      this.deps.routing.execute({
        origin: location,
        destination: input.newDrop,
        vehicleCategory: ride.vehicleCategory,
      }),
      this.deps.routing.execute({
        origin: ride.pickup,
        destination: input.newDrop,
        vehicleCategory: ride.vehicleCategory,
      }),
      this.deps.classify(ride.pickup, input.newDrop, ride.vehicleCategory),
    ]);
    for (const route of [oldRoute, newRoute, fullRoute]) {
      if (
        !Number.isSafeInteger(route.distanceM) ||
        route.distanceM <= 0 ||
        !route.polyline?.trim() ||
        !Number.isSafeInteger(route.durationS) ||
        route.durationS < 0 ||
        route.provider === 'HAVERSINE_ESTIMATE'
      )
        throw AppError.conflict(
          'EXTENSION_ROUTE_UNAVAILABLE: A verified driving route is required.',
        );
      let points: [number, number][];
      try {
        points = decodePolyline(route.polyline!);
      } catch {
        throw AppError.conflict('EXTENSION_ROUTE_UNAVAILABLE');
      }
      const destination = route === oldRoute ? ride.drop : input.newDrop;
      const origin = route === fullRoute ? ride.pickup : location;
      const first = points[0];
      const last = points.at(-1);
      if (
        points.length < 2 ||
        points.some(
          ([lng, lat]) =>
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            Math.abs(lat) > 90 ||
            Math.abs(lng) > 180,
        ) ||
        !first ||
        !last ||
        haversineDistanceM(origin, { lat: first[1], lng: first[0] }) > 1000 ||
        haversineDistanceM(destination, { lat: last[1], lng: last[0] }) > 1000
      )
        throw AppError.conflict(
          'EXTENSION_ROUTE_UNAVAILABLE: Route geometry does not match the trip.',
        );
    }
    const additionalDistanceM = newRoute.distanceM - oldRoute.distanceM;
    if (additionalDistanceM <= 0)
      throw AppError.badRequest('NOT_AN_EXTENSION: The new route must add driving distance.');
    const segment = this.deps.segmentRoute ?? calculateStateDistanceBreakdown;
    const oldSegments = segment({
      origin: location,
      destination: ride.drop,
      totalDistanceM: oldRoute.distanceM,
      polyline: oldRoute.polyline,
    });
    const newSegments = segment({
      origin: location,
      destination: input.newDrop,
      totalDistanceM: newRoute.distanceM,
      polyline: newRoute.polyline,
    });
    const additionalFarePaise = extensionFare(
      ride,
      zone.classification,
      oldSegments,
      newSegments,
      additionalDistanceM,
    );
    const now = this.now();
    if (now.getTime() - location.updatedAt.getTime() > 60000)
      throw AppError.conflict('DRIVER_LOCATION_STALE');
    const proposal: RideExtensionProposalDto = {
      id: newUuid(),
      requestId: input.requestId,
      originalDrop: ride.drop,
      newDrop: input.newDrop,
      additionalDistanceM,
      additionalFarePaise,
      status: 'REQUESTED',
      requestedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 120000).toISOString(),
      respondedAt: null,
      baselineRideVersion: ride.version + 1,
      route: {
        provider: fullRoute.provider,
        distanceM: fullRoute.distanceM,
        durationSeconds: fullRoute.durationS,
        polyline: fullRoute.polyline!,
      },
      zone,
    };
    return this.deps.unitOfWork.run(async () => {
      const saved = await saveRideTransition(
        this.deps.rideRepo,
        { ...ride, extensionProposal: proposal, version: ride.version + 1, updatedAt: now },
        ride.version,
      );
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        actorType: 'RIDER',
        actorId: input.riderId,
        eventType: 'EXTENSION_REQUESTED',
        previousStatus: ride.status,
        newStatus: ride.status,
        metadata: {
          ...proposal,
          comparisonOrigin: { lat: location.lat, lng: location.lng },
          oldRemainingDistanceM: oldRoute.distanceM,
          originalRouteSnapshot: ride.routeSnapshot,
        },
        createdAt: now,
      });
      return saved;
    });
  }

  async respond(input: {
    rideId: string;
    driverId: string;
    extensionId: string;
    decision: 'ACCEPT' | 'REJECT';
  }): Promise<RideEntity> {
    return this.deps.unitOfWork.run(async () => {
      const ride = await this.deps.rideRepo.findById(input.rideId);
      if (!ride || ride.driverId !== input.driverId) throw AppError.notFound('RIDE_NOT_FOUND');
      const proposal = ride.extensionProposal;
      if (!proposal || proposal.id !== input.extensionId)
        throw AppError.conflict('EXTENSION_CHANGED: Refresh the trip.');
      const outcome = input.decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
      if (proposal.status === outcome) return ride;
      if (proposal.status !== 'REQUESTED') throw AppError.conflict('EXTENSION_ALREADY_RESOLVED');
      if (ride.status !== 'TRIP_STARTED' || ride.version !== proposal.baselineRideVersion)
        throw AppError.conflict('EXTENSION_RIDE_CHANGED: Refresh the trip.');
      const now = this.now();
      if (Date.parse(proposal.expiresAt) <= now.getTime())
        throw AppError.conflict('EXTENSION_EXPIRED: Ask the rider for a new proposal.');
      const fare =
        (ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise) +
        proposal.additionalFarePaise;
      const distanceM = ride.routeSnapshot.distanceM + proposal.additionalDistanceM;
      if (!Number.isSafeInteger(fare) || !Number.isSafeInteger(distanceM))
        throw AppError.badRequest('EXTENSION_LIMIT_EXCEEDED');
      const saved = await saveRideTransition(
        this.deps.rideRepo,
        {
          ...ride,
          ...(outcome === 'ACCEPTED'
            ? {
                drop: proposal.newDrop,
                agreedFarePaise: fare,
                routeSnapshot: {
                  ...ride.routeSnapshot,
                  distanceM,
                  polyline: proposal.route.polyline,
                  durationSeconds: proposal.route.durationSeconds,
                  provider: proposal.route.provider,
                  calculatedAt: now,
                },
                zoneSnapshot: proposal.zone,
              }
            : {}),
          extensionProposal: { ...proposal, status: outcome, respondedAt: now.toISOString() },
          version: ride.version + 1,
          updatedAt: now,
        },
        ride.version,
      );
      await this.deps.rideEventRepo.save({
        id: newUuid(),
        rideId: ride.id,
        actorType: 'DRIVER',
        actorId: input.driverId,
        eventType: outcome === 'ACCEPTED' ? 'RIDE_EXTENDED' : 'EXTENSION_REJECTED',
        previousStatus: ride.status,
        newStatus: ride.status,
        metadata: {
          extensionId: proposal.id,
          additionalDistanceM: proposal.additionalDistanceM,
          additionalFarePaise: proposal.additionalFarePaise,
          agreedFarePaise: saved.agreedFarePaise,
          originalDrop: proposal.originalDrop,
          newDrop: proposal.newDrop,
        },
        createdAt: now,
      });
      return saved;
    });
  }
}

/** Allocate only the extra metres among states gaining distance; do not reprice agreed distance. */
function extensionFare(
  ride: RideEntity,
  classification: ZoneClassificationType,
  oldSegments: StateDistanceBreakdown[],
  newSegments: StateDistanceBreakdown[],
  extraM: number,
): number {
  const tariffs = ride.pricingSnapshot.extensionTariffs;
  const frozenStates = new Map(
    (ride.pricingSnapshot.stateBreakdown ?? []).map((s) => [s.stateCode, s.ratePerKmPaise]),
  );
  const originState = tariffs?.originStateCode ?? ride.zoneSnapshot.destinationStateCode;
  const rates = new Map<string, number>();
  for (const s of newSegments) {
    const knownState =
      s.stateCode === originState ||
      frozenStates.has(s.stateCode) ||
      tariffs?.stateRates[s.stateCode] !== undefined;
    if (!knownState)
      throw AppError.conflict('EXTENSION_TARIFF_MISSING: This state has no frozen tariff.');
    const rate =
      classification === 'IN_CITY' && ride.pricingSnapshot.zoneType === 'IN_CITY'
        ? ride.pricingSnapshot.ratePerKmPaise
        : (tariffs?.stateRates[s.stateCode] ??
          frozenStates.get(s.stateCode) ??
          tariffs?.outstationRatePerKmPaise);
    if (rate === undefined || !Number.isSafeInteger(rate) || rate < 0)
      throw AppError.conflict('EXTENSION_TARIFF_MISSING');
    rates.set(s.stateCode, rate);
  }
  const added = newSegments.map((s) => ({
    state: s.stateCode,
    metres: Math.max(
      0,
      s.distanceM - (oldSegments.find((old) => old.stateCode === s.stateCode)?.distanceM ?? 0),
    ),
  }));
  const totalAdded = added.reduce((sum, s) => sum + s.metres, 0);
  if (totalAdded <= 0) throw AppError.conflict('EXTENSION_ROUTE_UNAVAILABLE');
  const fare = Math.round(
    added.reduce((sum, s) => sum + (s.metres / totalAdded) * extraM * rates.get(s.state)!, 0) /
      1000,
  );
  if (!Number.isSafeInteger(fare)) throw AppError.badRequest('EXTENSION_LIMIT_EXCEEDED');
  return fare;
}
