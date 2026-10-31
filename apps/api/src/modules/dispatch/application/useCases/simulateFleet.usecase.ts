import type {
  VehicleCategory,
  DispatchFleetDriverDto,
  SimulateFleetPayload,
  SimulateFleetResponseDto,
} from '@cabzone/contracts';
import type { DriverPresencePort } from '../../domain/presence.port.js';

export interface SimulatedDriverSeed {
  driverId: string;
  userId: string;
  driverName: string;
  vehicleRegistration: string;
  vehicleCategory: VehicleCategory;
  lat: number;
  lng: number;
  heading: number;
  speedMps: number;
}

export const SILIGURI_SIMULATED_FLEET: readonly SimulatedDriverSeed[] = [
  {
    driverId: 'sim-driver-1',
    userId: 'sim-user-1',
    driverName: 'Rahul Sharma',
    vehicleRegistration: 'WB 74 AK 1024',
    vehicleCategory: 'CAB',
    lat: 26.7271,
    lng: 88.423,
    heading: 45,
    speedMps: 6,
  },
  {
    driverId: 'sim-driver-2',
    userId: 'sim-user-2',
    driverName: 'Bikash Roy',
    vehicleRegistration: 'WB 73 B 4421',
    vehicleCategory: 'CAB',
    lat: 26.7115,
    lng: 88.3912,
    heading: 120,
    speedMps: 4,
  },
  {
    driverId: 'sim-driver-3',
    userId: 'sim-user-3',
    driverName: 'Amit Barman',
    vehicleRegistration: 'WB 74 C 9980',
    vehicleCategory: 'CAB',
    lat: 26.745,
    lng: 88.435,
    heading: 190,
    speedMps: 8,
  },
  {
    driverId: 'sim-driver-4',
    userId: 'sim-user-4',
    driverName: 'Subhash Das',
    vehicleRegistration: 'WB 73 D 3311',
    vehicleCategory: 'CAB',
    lat: 26.685,
    lng: 88.33,
    heading: 270,
    speedMps: 12,
  },
  {
    driverId: 'sim-driver-5',
    userId: 'sim-user-5',
    driverName: 'Karan Chettri',
    vehicleRegistration: 'WB 74 M 7622',
    vehicleCategory: 'E_RICKSHAW',
    lat: 26.758,
    lng: 88.46,
    heading: 90,
    speedMps: 7,
  },
  {
    driverId: 'sim-driver-6',
    userId: 'sim-user-6',
    driverName: 'Pradip Paul',
    vehicleRegistration: 'WB 74 ER 5519',
    vehicleCategory: 'E_RICKSHAW',
    lat: 26.687,
    lng: 88.441,
    heading: 310,
    speedMps: 3,
  },
];

export class SimulateFleetUseCase {
  constructor(private readonly presence: DriverPresencePort) {}

  async execute(payload?: SimulateFleetPayload): Promise<SimulateFleetResponseDto> {
    const shouldClear = payload?.enabled === false || payload?.action === 'clear';

    if (shouldClear) {
      for (const d of SILIGURI_SIMULATED_FLEET) {
        await this.presence.remove(d.driverId);
      }
      return {
        count: 0,
        simulated: false,
        drivers: [],
      };
    }

    const now = new Date();
    const drivers: DispatchFleetDriverDto[] = [];

    for (const d of SILIGURI_SIMULATED_FLEET) {
      await this.presence.set({
        driverId: d.driverId,
        userId: d.userId,
        vehicleCategory: d.vehicleCategory,
        lat: d.lat,
        lng: d.lng,
        heading: d.heading,
        speedMps: d.speedMps,
        locationUpdatedAt: now,
      });

      drivers.push({
        driverId: d.driverId,
        userId: d.userId,
        vehicleCategory: d.vehicleCategory,
        lat: d.lat,
        lng: d.lng,
        heading: d.heading,
        speedMps: d.speedMps,
        status: 'ONLINE',
        activeRideId: null,
        locationUpdatedAt: now.toISOString(),
        driverName: d.driverName,
        vehicleRegistration: d.vehicleRegistration,
      });
    }

    return {
      count: drivers.length,
      simulated: true,
      drivers,
    };
  }
}
