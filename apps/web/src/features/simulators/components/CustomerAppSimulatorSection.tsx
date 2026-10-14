'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type {
  CancellationReason,
  DispatchFleetDriverDto,
  GeoPoint,
  QuoteDto,
  RideStatus,
  VehicleCategory,
  WalletSummaryDto,
} from '@cabzone/contracts';
import {
  Badge,
  Button,
  Input,
  SegmentedControl,
  Select,
  Skeleton,
  StatTile,
} from '@cabzone/design-system';
import {
  AlertCircle,
  Car,
  CheckCircle2,
  Clock,
  Copy,
  History,
  Key,
  MapPin,
  PlusCircle,
  Radio,
  Receipt,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import { ApiError } from '@/lib/api/ApiError';
import { dispatchApi } from '@/lib/api/endpoints/dispatch';
import { quotesApi } from '@/lib/api/endpoints/quotes';
import {
  ensureSimDriverToken,
  ensureSimRiderToken,
  ridesApi,
  type AdminRideDto,
  type RideEventDto,
} from '@/lib/api/endpoints/rides';
import { walletsApi, type WalletViewDto } from '@/lib/api/endpoints/wallets';
import { useZones } from '@/features/zones/hooks/useZones';
import { formatPaise } from '@/lib/format';

const TripPointMap = dynamic(
  () => import('@/features/quotes/components/TripPointMap').then((m) => m.TripPointMap),
  {
    ssr: false,
    loading: () => <Skeleton className="w-full h-[360px] rounded-lg" />,
  },
);

const DEFAULT_SILIGURI_PICKUP: GeoPoint = { lat: 26.7271, lng: 88.4334 };
const DEFAULT_SILIGURI_DROP: GeoPoint = { lat: 26.7141, lng: 88.425 };

const ROUTE_PRESETS: {
  id: string;
  label: string;
  description: string;
  pickup: GeoPoint;
  drop: GeoPoint;
}[] = [
  {
    id: 'siliguri-city',
    label: '🏙️ Siliguri City Center → Hill Cart Rd',
    description: 'In-City short trip (~2.2 km) around Siliguri default GPS',
    pickup: { lat: 26.7271, lng: 88.4334 },
    drop: { lat: 26.7141, lng: 88.425 },
  },
  {
    id: 'siliguri-sevoke',
    label: '🛍️ Sevoke Road → Junction Mall',
    description: 'In-City urban trip (~3.5 km)',
    pickup: { lat: 26.742, lng: 88.438 },
    drop: { lat: 26.721, lng: 88.429 },
  },
  {
    id: 'bagdogra-buffer',
    label: '✈️ City Center → Bagdogra Airport',
    description: 'Buffer zone trip (~13 km)',
    pickup: { lat: 26.7271, lng: 88.4334 },
    drop: { lat: 26.6812, lng: 88.3286 },
  },
  {
    id: 'outstation-kurseong',
    label: '⛰️ Siliguri → Kurseong (Outstation)',
    description: 'Outstation hill trip (~34 km, Cab only)',
    pickup: { lat: 26.7271, lng: 88.4334 },
    drop: { lat: 26.8821, lng: 88.2789 },
  },
];

const RIDE_STAGE_STEPS: {
  status: RideStatus;
  label: string;
  driverHint: string;
}[] = [
  {
    status: 'OFFERING',
    label: '1. Offering',
    driverHint: 'Open Driver App (ONLINE) → Ride Offer bottom sheet pops up → Tap "Accept Ride" (or use the simulator button below)',
  },
  {
    status: 'DRIVER_ASSIGNED',
    label: '2. Assigned',
    driverHint: 'On Driver App → Tap "Navigate / Go En Route" to head toward pickup',
  },
  {
    status: 'DRIVER_EN_ROUTE',
    label: '3. En Route',
    driverHint: 'On Driver App → Tap "Mark Arrived at Pickup" once at passenger location',
  },
  {
    status: 'DRIVER_ARRIVED',
    label: '4. Arrived (OTP)',
    driverHint: 'On Driver App → Enter the 4-digit Customer Pickup OTP shown below & tap "Start Trip"',
  },
  {
    status: 'TRIP_STARTED',
    label: '5. In Transit',
    driverHint: 'On Driver App → Drive to destination & tap "Complete Ride"',
  },
  {
    status: 'PAYMENT_PENDING',
    label: '6. Payment Pending',
    driverHint: 'On Driver App → Collect Cash/UPI & tap "Confirm Payment Received" to settle 8% commission',
  },
  {
    status: 'SETTLED',
    label: '7. Settled',
    driverHint: 'Ride complete! 8% commission debited from Driver Wallet & recorded in Earnings/History.',
  },
];

function parseVehicleInfo(raw: string | null | undefined): {
  category: VehicleCategory | null;
  registration: string | null;
} {
  if (!raw) return { category: null, registration: null };
  const match = raw.match(/^\[(CAB|E_RICKSHAW)\]\s*(.*)$/);
  if (match) {
    return {
      category: match[1] as VehicleCategory,
      registration: match[2] || null,
    };
  }
  if (raw === 'CAB' || raw === 'E_RICKSHAW') {
    return { category: raw, registration: null };
  }
  return { category: null, registration: raw };
}

export function CustomerAppSimulatorSection() {
  // 1. Target Driver & Live Fleet State
  const [fleetDrivers, setFleetDrivers] = useState<DispatchFleetDriverDto[]>([]);
  const [walletSummaries, setWalletSummaries] = useState<WalletSummaryDto[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [driverWalletView, setDriverWalletView] = useState<WalletViewDto | null>(null);
  const [driverRides, setDriverRides] = useState<AdminRideDto[]>([]);
  const [isRefreshingDriver, setIsRefreshingDriver] = useState(false);
  const [walletActionLoading, setWalletActionLoading] = useState(false);

  // 2. Customer Booking & Quote State
  const [customerName, setCustomerName] = useState('Priya Mukherjee');
  const [customerPhone, setCustomerPhone] = useState('+919000000003');
  const [pickup, setPickup] = useState<GeoPoint | null>(DEFAULT_SILIGURI_PICKUP);
  const [drop, setDrop] = useState<GeoPoint | null>(DEFAULT_SILIGURI_DROP);
  const [activePinTarget, setActivePinTarget] = useState<'pickup' | 'drop' | 'auto'>('auto');
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>('CAB');
  const [quote, setQuote] = useState<QuoteDto | null>(null);
  const [proposedFarePaise, setProposedFarePaise] = useState<number>(0);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // 3. Active Ride & Execution State
  const [activeRide, setActiveRide] = useState<(AdminRideDto & { pickupOtp?: string }) | null>(null);
  const [rideEvents, setRideEvents] = useState<RideEventDto[]>([]);
  const [rideLoading, setRideLoading] = useState(false);
  const [driverActionLoading, setDriverActionLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState<CancellationReason>('RIDER_CHANGED_MIND');
  const [disputeReason, setDisputeReason] = useState(
    'Driver collected cash twice after UPI transfer completed.',
  );
  const [otpCopied, setOtpCopied] = useState(false);

  // 4. Inspector Bottom Tab ('wallet' | 'history' | 'events')
  const [inspectorTab, setInspectorTab] = useState<'wallet' | 'history' | 'events'>('wallet');
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  const { data: zonesData } = useZones({ status: 'ACTIVE' });
  const activeZones = zonesData?.items ?? [];

  // Fetch Fleet + Registered Drivers
  const refreshFleetAndDrivers = useCallback(async () => {
    try {
      const [fleetRes, walletsRes] = await Promise.all([
        dispatchApi.getFleet().catch(() => [] as DispatchFleetDriverDto[]),
        walletsApi.list({ type: 'DRIVER', limit: 50 }).catch(() => ({ items: [], total: 0 })),
      ]);
      setFleetDrivers(fleetRes);
      setWalletSummaries(walletsRes.items);

      setSelectedDriverId((prev) => {
        if (prev) return prev;
        // Prefer real (non-sim) online driver first
        const realOnline = fleetRes.find((d) => !d.driverId.startsWith('sim-driver-'));
        if (realOnline) return realOnline.driverId;
        const firstWalletDriver = walletsRes.items[0];
        if (firstWalletDriver) return firstWalletDriver.ownerId;
        return fleetRes[0]?.driverId ?? '';
      });
    } catch {
      // ignore background poll error
    }
  }, []);

  // Fetch Selected Driver's Wallet + Ride History
  const refreshSelectedDriverInspector = useCallback(async (driverId: string) => {
    if (!driverId || driverId.startsWith('sim-driver-')) {
      setDriverWalletView(null);
      setDriverRides([]);
      return;
    }
    setIsRefreshingDriver(true);
    try {
      const [walletData, ridesData] = await Promise.all([
        walletsApi.get(driverId).catch(() => null),
        ridesApi.list({ driverId, limit: 20 }).catch(() => [] as AdminRideDto[]),
      ]);
      setDriverWalletView(walletData);
      setDriverRides(ridesData);
    } finally {
      setIsRefreshingDriver(false);
    }
  }, []);

  useEffect(() => {
    void refreshFleetAndDrivers();
    const interval = setInterval(() => {
      void refreshFleetAndDrivers();
    }, 3500);
    return () => clearInterval(interval);
  }, [refreshFleetAndDrivers]);

  useEffect(() => {
    if (!selectedDriverId) return;
    void refreshSelectedDriverInspector(selectedDriverId);
    const interval = setInterval(() => {
      void refreshSelectedDriverInspector(selectedDriverId);
    }, 4500);
    return () => clearInterval(interval);
  }, [selectedDriverId, refreshSelectedDriverInspector]);

  // Poll Active Ride as Customer (to get 4-digit pickupOtp and watch Driver App transitions live)
  const refreshActiveRideStatus = useCallback(
    async (rideId: string) => {
      try {
        const riderToken = await ensureSimRiderToken(customerPhone);
        const [freshRide, events] = await Promise.all([
          ridesApi.get(rideId, riderToken),
          ridesApi.events(rideId, riderToken).catch(() => [] as RideEventDto[]),
        ]);
        setActiveRide((prev) => ({
          ...freshRide,
          pickupOtp: freshRide.pickupOtp ?? prev?.pickupOtp,
        }));
        setRideEvents(events);
        if (freshRide.driverId && freshRide.driverId !== selectedDriverId) {
          setSelectedDriverId(freshRide.driverId);
        }
      } catch {
        // ignore transient poll error
      }
    },
    [customerPhone, selectedDriverId],
  );

  useEffect(() => {
    if (!activeRide?.id) return;
    const interval = setInterval(() => {
      void refreshActiveRideStatus(activeRide.id);
    }, 2000);
    return () => clearInterval(interval);
  }, [activeRide?.id, refreshActiveRideStatus]);

  // Combined driver options for selector
  const driverOptions = useMemo(() => {
    const map = new Map<
      string,
      {
        driverId: string;
        name: string;
        phone: string;
        vehicleRegistration: string | null;
        vehicleCategory: VehicleCategory | null;
        livePresence: DispatchFleetDriverDto | null;
        walletBalancePaise: number | null;
      }
    >();

    for (const w of walletSummaries) {
      const parsed = parseVehicleInfo(w.vehicleNumber);
      map.set(w.ownerId, {
        driverId: w.ownerId,
        name: w.name || `Driver (${w.phoneE164.slice(-4)})`,
        phone: w.phoneE164,
        vehicleRegistration: parsed.registration,
        vehicleCategory: parsed.category,
        livePresence: null,
        walletBalancePaise: w.balancePaise,
      });
    }

    for (const f of fleetDrivers) {
      const existing = map.get(f.driverId);
      map.set(f.driverId, {
        driverId: f.driverId,
        name: f.driverName || existing?.name || f.driverId,
        phone: f.phoneE164 || existing?.phone || '—',
        vehicleRegistration: f.vehicleRegistration || existing?.vehicleRegistration || null,
        vehicleCategory: f.vehicleCategory ?? existing?.vehicleCategory ?? null,
        livePresence: f,
        walletBalancePaise: existing?.walletBalancePaise ?? null,
      });
    }

    return Array.from(map.values()).sort((a, b) => {
      const aRealOnline = a.livePresence && !a.driverId.startsWith('sim-driver-') ? 1 : 0;
      const bRealOnline = b.livePresence && !b.driverId.startsWith('sim-driver-') ? 1 : 0;
      if (aRealOnline !== bRealOnline) return bRealOnline - aRealOnline;
      const aOnline = a.livePresence ? 1 : 0;
      const bOnline = b.livePresence ? 1 : 0;
      return bOnline - aOnline;
    });
  }, [fleetDrivers, walletSummaries]);

  const selectedDriver = useMemo(
    () => driverOptions.find((d) => d.driverId === selectedDriverId) ?? null,
    [driverOptions, selectedDriverId],
  );

  // Automatically sync vehicleCategory when selecting a driver with a known vehicleCategory
  useEffect(() => {
    const cat = selectedDriver?.livePresence?.vehicleCategory ?? selectedDriver?.vehicleCategory;
    if (cat && cat !== vehicleCategory) {
      setVehicleCategory(cat);
      setQuote(null);
    }
  }, [selectedDriver?.driverId, selectedDriver?.livePresence?.vehicleCategory, selectedDriver?.vehicleCategory, vehicleCategory]);

  // Put Selected Driver ONLINE at Customer Pickup GPS (1-click helper if mobile app is offline/disconnected)
  const handleForceDriverOnline = async (silent = false): Promise<boolean> => {
    if (!selectedDriver?.phone || selectedDriver.phone === '—') {
      if (!silent) setBannerError('Select a registered driver with a valid phone number first.');
      return false;
    }
    setDriverActionLoading(true);
    if (!silent) setBannerError(null);
    try {
      const driverToken = await ensureSimDriverToken(selectedDriver.phone);
      const targetLat = pickup?.lat ?? DEFAULT_SILIGURI_PICKUP.lat;
      const targetLng = pickup?.lng ?? DEFAULT_SILIGURI_PICKUP.lng;
      try {
        await ridesApi.setDriverStatus(
          { status: 'ONLINE', lat: targetLat, lng: targetLng },
          driverToken,
        );
      } catch {
        // Auto test-approve if driver profile isn't approved yet, then retry
        await ridesApi.testApproveDriver(driverToken);
        await ridesApi.setDriverStatus(
          { status: 'ONLINE', lat: targetLat, lng: targetLng },
          driverToken,
        );
      }
      await refreshFleetAndDrivers();
      if (selectedDriverId) await refreshSelectedDriverInspector(selectedDriverId);
      if (!silent) {
        setBannerSuccess(
          `${selectedDriver.name} (${selectedDriver.phone}) is now ONLINE at (${targetLat.toFixed(4)}, ${targetLng.toFixed(4)}) and ready to receive offers!`,
        );
      }
      return true;
    } catch (err) {
      if (!silent) {
        setBannerError(
          err instanceof Error ? err.message : 'Failed to put selected driver online',
        );
      }
      return false;
    } finally {
      setDriverActionLoading(false);
    }
  };

  // Snap Customer Pickup right next to the selected online driver's GPS
  const handleSnapToDriver = () => {
    const live = selectedDriver?.livePresence;
    const cat = live?.vehicleCategory ?? selectedDriver?.vehicleCategory;
    if (cat) setVehicleCategory(cat);
    if (!live) {
      setPickup(DEFAULT_SILIGURI_PICKUP);
      setDrop(DEFAULT_SILIGURI_DROP);
      setQuote(null);
      setBannerSuccess(
        'Driver is currently offline; snapped pickup to Siliguri default coordinates (26.7271, 88.4334). Click "Put Driver Online Here" to bring them online!',
      );
      return;
    }
    const snappedPickup = {
      lat: Number((live.lat + 0.0008).toFixed(6)),
      lng: Number((live.lng + 0.0008).toFixed(6)),
    };
    const snappedDrop = {
      lat: Number((live.lat - 0.012).toFixed(6)),
      lng: Number((live.lng - 0.008).toFixed(6)),
    };
    setPickup(snappedPickup);
    setDrop(snappedDrop);
    setQuote(null);
    setBannerSuccess(
      `Snapped pickup within ~120m of ${selectedDriver.name}'s live GPS (${live.lat.toFixed(4)}, ${live.lng.toFixed(4)}) and matched category (${live.vehicleCategory}).`,
    );
  };

  // Step 1: Simulate Quote
  const handleCalculateQuote = async (categoryOverride?: VehicleCategory): Promise<QuoteDto | null> => {
    if (!pickup || !drop) return null;
    setQuoteLoading(true);
    setBannerError(null);
    try {
      const computed = await quotesApi.simulate({
        pickup,
        drop,
        vehicleCategory: categoryOverride ?? vehicleCategory,
      });
      setQuote(computed);
      setProposedFarePaise(computed.suggestedFarePaise);
      return computed;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Failed to calculate quote';
      setBannerError(msg);
      return null;
    } finally {
      setQuoteLoading(false);
    }
  };

  // Step 2: Request Ride as Customer (Broadcasts to Driver App)
  const handleRequestRide = async (quoteOverride?: QuoteDto) => {
    setRideLoading(true);
    setBannerError(null);
    setBannerSuccess(null);
    try {
      // Ensure selected driver is online & wallet-funded so the broadcast never lands on 0 drivers
      if (selectedDriver && !selectedDriver.driverId.startsWith('sim-driver-')) {
        if ((driverMetrics.balancePaise ?? 0) <= 0) {
          await walletsApi
            .adjust({
              driverId: selectedDriver.driverId,
              type: 'CREDIT',
              amountPaise: 50000,
              reason: 'Auto top-up (+₹500) before ride broadcast',
              idempotencyKey: `sim_auto_topup_${selectedDriver.driverId}_${Date.now()}`,
            })
            .catch(() => null);
        }
        if (!selectedDriver.livePresence) {
          await handleForceDriverOnline(true);
        }
      }

      const driverCat =
        selectedDriver?.livePresence?.vehicleCategory ?? selectedDriver?.vehicleCategory;
      const effectiveCategory = driverCat ?? vehicleCategory;
      if (effectiveCategory !== vehicleCategory) {
        setVehicleCategory(effectiveCategory);
      }

      const activeQuote =
        quoteOverride ??
        (quote && quote.vehicleCategory === effectiveCategory
          ? quote
          : await handleCalculateQuote(effectiveCategory));
      if (!activeQuote) return;

      const riderToken = await ensureSimRiderToken(customerPhone);
      const fareToOffer =
        quoteOverride && proposedFarePaise === 0
          ? activeQuote.suggestedFarePaise
          : proposedFarePaise || activeQuote.suggestedFarePaise;

      const created = await ridesApi.create(
        {
          quoteToken: activeQuote.quoteToken,
          proposedFarePaise: fareToOffer,
          passenger: {
            name: customerName.trim() || 'Priya Mukherjee',
            phoneE164: customerPhone.trim() || '+919000000003',
          },
          vehicleCategory: activeQuote.vehicleCategory,
          pickup: activeQuote.pickup,
          drop: activeQuote.drop,
        },
        riderToken,
      );

      setActiveRide(created);
      const events = await ridesApi.events(created.id, riderToken).catch(() => []);
      setRideEvents(events);
      setBannerSuccess(
        `Ride offer #${created.id.slice(0, 8)} broadcast for ${activeQuote.vehicleCategory} at ${formatPaise(fareToOffer)}! Accept or counter on your Driver App — or use the Driver Simulator buttons on the right.`,
      );
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Failed to request ride';
      setBannerError(msg);
    } finally {
      setRideLoading(false);
    }
  };

  // Interactive Driver Action Executor (lets user test Driver App steps from Web Simulator OR Mobile App)
  const handleSimulateDriverAction = async (
    action:
      | 'ACCEPT'
      | 'COUNTER'
      | 'EN_ROUTE'
      | 'ARRIVED'
      | 'START_OTP'
      | 'COMPLETE'
      | 'CONFIRM_PAYMENT',
  ) => {
    if (!activeRide) return;
    const targetDriver =
      driverOptions.find((d) => d.driverId === (activeRide.driverId ?? selectedDriverId)) ??
      selectedDriver;
    if (!targetDriver?.phone || targetDriver.phone === '—') {
      setBannerError('Select a registered driver account in Section 1 first.');
      return;
    }

    setDriverActionLoading(true);
    setBannerError(null);
    try {
      const driverToken = await ensureSimDriverToken(targetDriver.phone);
      // Ensure driver is online at pickup before ACCEPT / COUNTER
      if (action === 'ACCEPT' || action === 'COUNTER') {
        await ridesApi
          .setDriverStatus(
            {
              status: 'ONLINE',
              lat: activeRide.pickup.lat,
              lng: activeRide.pickup.lng,
            },
            driverToken,
          )
          .catch(async () => {
            await ridesApi.testApproveDriver(driverToken);
            await ridesApi.setDriverStatus(
              {
                status: 'ONLINE',
                lat: activeRide.pickup.lat,
                lng: activeRide.pickup.lng,
              },
              driverToken,
            );
          });
      }

      if (action === 'ACCEPT') {
        await ridesApi.accept(activeRide.id, undefined, driverToken);
        setBannerSuccess(
          `${targetDriver.name} accepted the ride! The 4-digit Customer Pickup OTP is now generated below.`,
        );
      } else if (action === 'COUNTER') {
        const baseFare = activeRide.proposedFarePaise ?? activeRide.suggestedFarePaise;
        const counterFare = baseFare + 3000; // +₹30 counter
        await ridesApi.counter(activeRide.id, counterFare, driverToken);
        setBannerSuccess(
          `${targetDriver.name} proposed a counter-offer of ${formatPaise(counterFare)}! Accept or Reject it as Customer below.`,
        );
      } else if (action === 'EN_ROUTE') {
        await ridesApi.enRoute(activeRide.id, undefined, driverToken);
        setBannerSuccess(`${targetDriver.name} marked status as DRIVER_EN_ROUTE.`);
      } else if (action === 'ARRIVED') {
        await ridesApi.arrived(activeRide.id, undefined, driverToken);
        setBannerSuccess(
          `${targetDriver.name} arrived at pickup! Verify the 4-digit OTP (${activeRide.pickupOtp ?? '----'}) to start the trip.`,
        );
      } else if (action === 'START_OTP') {
        const riderToken = await ensureSimRiderToken(customerPhone);
        const riderView = await ridesApi.get(activeRide.id, riderToken);
        const otpToUse = riderView.pickupOtp ?? activeRide.pickupOtp;
        if (!otpToUse) {
          throw new Error('Pickup OTP not available on ride yet.');
        }
        await ridesApi.start(activeRide.id, otpToUse, undefined, driverToken);
        setBannerSuccess(
          `Verified Pickup OTP (${otpToUse}) — Trip is now IN TRANSIT (TRIP_STARTED)!`,
        );
      } else if (action === 'COMPLETE') {
        await ridesApi.complete(activeRide.id, undefined, driverToken);
        setBannerSuccess(
          'Trip completed at drop-off! Status is now PAYMENT_PENDING (awaiting Cash/UPI confirmation).',
        );
      } else if (action === 'CONFIRM_PAYMENT') {
        const res = await ridesApi.confirmPayment(activeRide.id, driverToken);
        setBannerSuccess(
          `Payment confirmed & settled! 8% commission (${formatPaise(res.commissionPaise)}) debited from driver wallet. New balance: ${formatPaise(res.walletBalancePaise)}.`,
        );
      }

      await refreshActiveRideStatus(activeRide.id);
      await refreshFleetAndDrivers();
      if (targetDriver.driverId) {
        await refreshSelectedDriverInspector(targetDriver.driverId);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Driver action failed';
      setBannerError(msg);
    } finally {
      setDriverActionLoading(false);
    }
  };

  // Driver counter-offers still waiting for the customer's answer (latest per driver).
  const pendingCounters = useMemo(() => {
    const pending = new Map<string, number>();
    for (const e of [...rideEvents].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const driverId = String(e.metadata['driverId'] ?? '');
      if (e.eventType === 'FARE_COUNTER_PROPOSED') {
        pending.set(driverId, Number(e.metadata['proposedFarePaise']));
      } else if (e.eventType === 'FARE_COUNTER_ACCEPTED' || e.eventType === 'FARE_COUNTER_REJECTED') {
        pending.delete(driverId);
      }
    }
    return [...pending].map(([driverId, farePaise]) => ({ driverId, farePaise }));
  }, [rideEvents]);

  const handleCounterResponse = async (driverId: string, action: 'ACCEPTED' | 'REJECTED') => {
    if (!activeRide) return;
    setRideLoading(true);
    setBannerError(null);
    try {
      const riderToken = await ensureSimRiderToken(customerPhone);
      await ridesApi.respondCounter(activeRide.id, { driverId, action }, riderToken);
      await refreshActiveRideStatus(activeRide.id);
      setBannerSuccess(
        action === 'ACCEPTED'
          ? 'Counter accepted: driver assigned at their fare. Pickup OTP is shown below.'
          : 'Counter rejected: the offer stays open for other drivers.',
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Could not answer counter-offer');
    } finally {
      setRideLoading(false);
    }
  };

  // Customer Cancel Ride
  const handleCustomerCancel = async () => {
    if (!activeRide) return;
    setRideLoading(true);
    setBannerError(null);
    try {
      const riderToken = await ensureSimRiderToken(customerPhone);
      const res = await ridesApi.cancel(activeRide.id, cancelReason, riderToken);
      setActiveRide(res.ride);
      await refreshActiveRideStatus(activeRide.id);
      if (selectedDriverId) void refreshSelectedDriverInspector(selectedDriverId);
      setBannerSuccess(`Ride cancelled by Customer (${cancelReason}).`);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Cancellation failed');
    } finally {
      setRideLoading(false);
    }
  };

  // Customer File Payment Dispute (after SETTLED)
  const handleFileDispute = async () => {
    if (!activeRide) return;
    setRideLoading(true);
    setBannerError(null);
    try {
      const riderToken = await ensureSimRiderToken(customerPhone);
      const updated = await ridesApi.disputePayment(activeRide.id, disputeReason, riderToken);
      setActiveRide((prev) => ({ ...updated, pickupOtp: prev?.pickupOtp }));
      await refreshActiveRideStatus(activeRide.id);
      setBannerSuccess('Payment dispute filed by Customer! Status is now PAYMENT_DISPUTED.');
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to file payment dispute');
    } finally {
      setRideLoading(false);
    }
  };

  // Admin Resolve Payment Dispute (Rider Wins = Refund 8% Commission / Driver Wins = Keep)
  const handleResolveDispute = async (outcome: 'RIDER_WINS' | 'DRIVER_WINS') => {
    if (!activeRide) return;
    setRideLoading(true);
    setBannerError(null);
    try {
      const updated = await ridesApi.resolvePaymentDispute(
        activeRide.id,
        outcome,
        outcome === 'RIDER_WINS'
          ? 'Verified customer overcharge claim; refunding platform commission to driver wallet.'
          : 'Verified driver collected agreed fare; retaining platform commission.',
      );
      setActiveRide((prev) => ({ ...updated, pickupOtp: prev?.pickupOtp }));
      await refreshActiveRideStatus(activeRide.id);
      if (selectedDriverId) await refreshSelectedDriverInspector(selectedDriverId);
      setBannerSuccess(
        outcome === 'RIDER_WINS'
          ? 'Dispute resolved (RIDER_WINS): 8% commission refunded to Driver Wallet as DISPUTE_REFUND!'
          : 'Dispute resolved (DRIVER_WINS): Settlement retained.',
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to resolve dispute');
    } finally {
      setRideLoading(false);
    }
  };

  // Wallet Top-Up / Drain Helper for Selected Driver
  const handleAdjustDriverWallet = async (
    type: 'CREDIT' | 'DEBIT',
    amountPaise: number,
    reason: string,
  ) => {
    if (!selectedDriverId || selectedDriverId.startsWith('sim-driver-')) {
      setBannerError('Select a real registered driver account to adjust wallet balance.');
      return;
    }
    if (amountPaise <= 0) {
      setBannerError('Adjustment amount must be greater than ₹0.');
      return;
    }
    setWalletActionLoading(true);
    setBannerError(null);
    try {
      await walletsApi.adjust({
        driverId: selectedDriverId,
        type,
        amountPaise,
        reason,
        idempotencyKey: `sim_wallet_${selectedDriverId}_${Date.now()}`,
      });
      await Promise.all([
        refreshSelectedDriverInspector(selectedDriverId),
        refreshFleetAndDrivers(),
      ]);
      setBannerSuccess(
        `${type === 'CREDIT' ? 'Credited' : 'Debited'} ${formatPaise(amountPaise)} on driver wallet (${reason}). Refresh your Driver App to see the updated balance!`,
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to adjust driver wallet');
    } finally {
      setWalletActionLoading(false);
    }
  };

  // Compute Driver Earnings & Commission metrics from authoritative driverRides + wallet transactions
  const driverMetrics = useMemo(() => {
    const balancePaise =
      driverWalletView?.wallet?.balancePaise ?? selectedDriver?.walletBalancePaise ?? 0;
    const settledRides = driverRides.filter(
      (r) => r.status === 'SETTLED' || r.status === 'PAYMENT_DISPUTED',
    );
    const grossEarningsPaise = settledRides.reduce(
      (sum, r) => sum + (r.agreedFarePaise ?? r.proposedFarePaise ?? r.suggestedFarePaise),
      0,
    );
    const commissionDebitsPaise = (driverWalletView?.transactions ?? [])
      .filter((t) => t.type === 'DEBIT' && t.referenceType === 'RIDE_COMMISSION')
      .reduce((sum, t) => sum + t.amountPaise, 0);
    const disputeRefundsPaise = (driverWalletView?.transactions ?? [])
      .filter((t) => t.type === 'CREDIT' && t.referenceType === 'DISPUTE_REFUND')
      .reduce((sum, t) => sum + t.amountPaise, 0);
    const netCommissionPaise = Math.max(0, commissionDebitsPaise - disputeRefundsPaise);
    const netTakeHomePaise = Math.max(0, grossEarningsPaise - netCommissionPaise);

    return {
      balancePaise,
      isDispatchEligible: balancePaise > 0,
      completedCount: settledRides.length,
      grossEarningsPaise,
      netCommissionPaise,
      netTakeHomePaise,
    };
  }, [driverWalletView, driverRides, selectedDriver]);

  const activeFarePaise =
    activeRide?.agreedFarePaise ??
    activeRide?.proposedFarePaise ??
    activeRide?.suggestedFarePaise ??
    0;
  const activeCommissionPaise = Math.round(activeFarePaise * 0.08);

  return (
    <div className="flex flex-col gap-6">
      {/* Status Notifications */}
      {bannerError && (
        <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-danger/40 bg-danger/10 text-xs text-danger">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span className="font-mono break-words">{bannerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            className="text-xs font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {bannerSuccess && (
        <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-success/40 bg-success/10 text-xs text-success">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            <span>{bannerSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerSuccess(null)}
            className="text-xs font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SECTION 1: ONLINE / OFFLINE & LOCATION TELEMETRY MONITOR */}
      <div className="p-5 rounded-xl border border-border-strong bg-surface flex flex-col gap-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-interactive/10 text-interactive border border-interactive/20">
              <Radio className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text">
                  1. Driver App Online/Offline & Live Location Monitor
                </h3>
                {selectedDriver?.livePresence ? (
                  <Badge
                    tone={selectedDriver.livePresence.status === 'ONLINE' ? 'success' : 'warning'}
                  >
                    ● {selectedDriver.livePresence.status}
                  </Badge>
                ) : (
                  <Badge tone="neutral">○ OFFLINE</Badge>
                )}
              </div>
              <p className="text-xs text-text-subtle">
                Select your Driver App account to monitor its live GPS pings, online status, and snap the customer pickup within its 5km dispatch radius.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-64">
              <Select
                value={selectedDriverId}
                onValueChange={(val) => setSelectedDriverId(val)}
                placeholder="No drivers found yet"
                disabled={driverOptions.length === 0}
                options={driverOptions.map((d) => ({
                  value: d.driverId,
                  label: `${d.livePresence ? '🟢' : '⚪'} ${d.name} (${d.phone})`,
                }))}
              />
            </div>

            <Button
              variant="secondary"
              size="sm"
              loading={driverActionLoading}
              disabled={!selectedDriver?.phone}
              onClick={() => void handleForceDriverOnline(false)}
              title="Put selected driver ONLINE at current customer pickup coordinates"
            >
              <Radio className="size-3.5 text-success" />
              <span>Put Driver Online Here</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleSnapToDriver}
              title="Set customer pickup right next to the driver's live GPS"
            >
              <MapPin className="size-3.5 text-interactive" />
              <span>Snap Pickup to Driver GPS</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void refreshFleetAndDrivers();
                if (selectedDriverId) void refreshSelectedDriverInspector(selectedDriverId);
              }}
            >
              <RefreshCw className={`size-3.5 ${isRefreshingDriver ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </Button>
          </div>
        </div>

        {/* Driver Live Telemetry Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-surface-muted/50 border border-border">
            <span className="text-[11px] text-text-subtle block">Availability State</span>
            <span className="font-bold text-sm text-text mt-0.5 block">
              {selectedDriver?.livePresence
                ? selectedDriver.livePresence.status === 'BUSY'
                  ? 'BUSY (On Trip)'
                  : 'ONLINE (Dispatch Ready)'
                : 'OFFLINE'}
            </span>
            <span className="text-[10px] text-text-subtle font-mono">
              {selectedDriver?.livePresence
                ? `Updated ${new Date(selectedDriver.livePresence.locationUpdatedAt).toLocaleTimeString()}`
                : 'Tap GO ONLINE on Driver App'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-surface-muted/50 border border-border">
            <span className="text-[11px] text-text-subtle block">Live GPS Coordinates</span>
            <span className="font-mono font-semibold text-text mt-0.5 block">
              {selectedDriver?.livePresence
                ? `${selectedDriver.livePresence.lat.toFixed(4)}, ${selectedDriver.livePresence.lng.toFixed(4)}`
                : 'No active GPS ping'}
            </span>
            <span className="text-[10px] text-text-subtle">
              {selectedDriver?.livePresence
                ? `Speed: ${Math.round((selectedDriver.livePresence.speedMps ?? 0) * 3.6)} km/h • Heading: ${selectedDriver.livePresence.heading ?? 0}°`
                : 'Default Siliguri: 26.7271, 88.4334'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-surface-muted/50 border border-border">
            <span className="text-[11px] text-text-subtle block">Vehicle & Category</span>
            <span className="font-semibold text-text mt-0.5 block">
              {selectedDriver?.livePresence?.vehicleCategory ??
                selectedDriver?.vehicleCategory ??
                'CAB'}{' '}
              •{' '}
              <span className="font-mono">
                {selectedDriver?.vehicleRegistration ?? 'WB74AB1234'}
              </span>
            </span>
            <span className="text-[10px] text-text-subtle">
              Must match Customer vehicle filter
            </span>
          </div>

          <div className="p-3 rounded-lg bg-surface-muted/50 border border-border">
            <span className="text-[11px] text-text-subtle block">Prepaid Wallet Balance</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`font-bold text-sm font-mono ${
                  driverMetrics.balancePaise > 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {formatPaise(driverMetrics.balancePaise)}
              </span>
              <Badge tone={driverMetrics.isDispatchEligible ? 'success' : 'danger'}>
                {driverMetrics.isDispatchEligible ? 'Eligible' : 'Blocked (≤ ₹0)'}
              </Badge>
            </div>
            <span className="text-[10px] text-text-subtle">
              {driverMetrics.isDispatchEligible
                ? 'Can receive & accept ride offers'
                : 'Top up wallet below to receive offers'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-surface-muted/50 border border-border flex flex-col justify-between">
            <span className="text-[11px] text-text-subtle block">Quick Wallet Test</span>
            <div className="flex items-center gap-1.5 mt-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={walletActionLoading || !selectedDriverId}
                onClick={() =>
                  handleAdjustDriverWallet(
                    'CREDIT',
                    50000,
                    'Simulator top-up (+₹500) for dispatch testing',
                  )
                }
                className="text-[11px] h-7 px-2"
              >
                +₹500
              </Button>
              {driverMetrics.balancePaise > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={walletActionLoading || !selectedDriverId}
                  onClick={() =>
                    handleAdjustDriverWallet(
                      'DEBIT',
                      driverMetrics.balancePaise,
                      'Simulator drain to ₹0 to test DRIVER_WALLET_ZERO_BALANCE block',
                    )
                  }
                  className="text-[11px] h-7 px-2 text-danger"
                >
                  Set ₹0
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2 & 3: TWO-PANE CUSTOMER APP SIMULATOR + LIVE RIDE EXECUTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (7 cols): CUSTOMER BOOKING & MAP */}
        <div className="lg:col-span-7 flex flex-col gap-4 p-5 rounded-xl border border-border-strong bg-surface shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-accent/10 text-accent">
                <Smartphone className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text">
                  2. Customer App — Ride Request & Dispatch Creator
                </h3>
                <p className="text-xs text-text-subtle">
                  Place pickup & drop pins, negotiate fare, and broadcast a live ride request to your Driver App.
                </p>
              </div>
            </div>
            <Badge tone="accent">Role: RIDER</Badge>
          </div>

          {/* Route Presets */}
          <div className="flex flex-wrap gap-1.5">
            {ROUTE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setPickup(preset.pickup);
                  setDrop(preset.drop);
                  setQuote(null);
                }}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-border bg-surface-muted/60 hover:bg-surface-muted text-text font-medium transition-colors"
                title={preset.description}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Interactive Map */}
          <div className="w-full h-[340px] rounded-lg overflow-hidden border border-border">
            <TripPointMap
              pickup={pickup}
              drop={drop}
              onPickupChange={(pt) => {
                setPickup(pt);
                setQuote(null);
              }}
              onDropChange={(pt) => {
                setDrop(pt);
                setQuote(null);
              }}
              activeTarget={activePinTarget}
              zones={activeZones}
              className="w-full h-[340px]"
            />
          </div>

          {/* Coordinates, Customer Details & Vehicle Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-border bg-surface-muted/30 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-success flex items-center gap-1">
                  ● Pickup Coordinates
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setActivePinTarget(activePinTarget === 'pickup' ? 'auto' : 'pickup')
                  }
                  className={`text-[11px] font-medium underline ${
                    activePinTarget === 'pickup' ? 'text-interactive font-bold' : 'text-text-subtle'
                  }`}
                >
                  {activePinTarget === 'pickup' ? 'Click map to set...' : 'Pick on map'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  step="0.0001"
                  value={pickup?.lat ?? ''}
                  onChange={(e) =>
                    setPickup({ lat: Number(e.target.value), lng: pickup?.lng ?? 88.4334 })
                  }
                  placeholder="Lat"
                  className="h-8 text-xs font-mono"
                />
                <Input
                  type="number"
                  step="0.0001"
                  value={pickup?.lng ?? ''}
                  onChange={(e) =>
                    setPickup({ lat: pickup?.lat ?? 26.7271, lng: Number(e.target.value) })
                  }
                  placeholder="Lng"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border bg-surface-muted/30 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-danger flex items-center gap-1">
                  ● Drop Coordinates
                </span>
                <button
                  type="button"
                  onClick={() => setActivePinTarget(activePinTarget === 'drop' ? 'auto' : 'drop')}
                  className={`text-[11px] font-medium underline ${
                    activePinTarget === 'drop' ? 'text-interactive font-bold' : 'text-text-subtle'
                  }`}
                >
                  {activePinTarget === 'drop' ? 'Click map to set...' : 'Pick on map'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  step="0.0001"
                  value={drop?.lat ?? ''}
                  onChange={(e) =>
                    setDrop({ lat: Number(e.target.value), lng: drop?.lng ?? 88.425 })
                  }
                  placeholder="Lat"
                  className="h-8 text-xs font-mono"
                />
                <Input
                  type="number"
                  step="0.0001"
                  value={drop?.lng ?? ''}
                  onChange={(e) =>
                    setDrop({ lat: drop?.lat ?? 26.7141, lng: Number(e.target.value) })
                  }
                  placeholder="Lng"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-[11px] text-text-subtle font-medium block mb-1">
                Customer Name
              </span>
              <Input
                aria-label="Customer Name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <span className="text-[11px] text-text-subtle font-medium block mb-1">
                Customer Phone (E.164)
              </span>
              <Input
                aria-label="Customer Phone (E.164)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>
            <div>
              <span className="text-[11px] text-text-subtle font-medium block mb-1">
                Vehicle Category
              </span>
              <Select
                value={vehicleCategory}
                onValueChange={(val) => {
                  setVehicleCategory(val as VehicleCategory);
                  setQuote(null);
                }}
                options={[
                  { value: 'CAB', label: '🚕 CAB (City & Outstation)' },
                  { value: 'E_RICKSHAW', label: '🛺 E_RICKSHAW (City Only)' },
                ]}
              />
            </div>
          </div>

          {/* Quote & Fare Negotiation Box */}
          {quote && (
            <div className="p-3.5 rounded-xl border border-interactive/30 bg-interactive/5 flex flex-col gap-2.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge tone="accent">{quote.serviceType}</Badge>
                  <span className="font-semibold text-text">
                    {(quote.distanceM / 1000).toFixed(2)} km • ~
                    {Math.max(1, Math.round(quote.estimatedDurationSeconds / 60))} mins
                  </span>
                </div>
                <span className="text-[11px] text-text-subtle font-mono">
                  8% Commission: {formatPaise(Math.round(proposedFarePaise * 0.08))}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-text-subtle">Customer Offered Fare:</span>
                <span className="text-lg font-bold text-text">
                  {formatPaise(proposedFarePaise)}
                </span>
              </div>

              <input
                type="range"
                min={quote.negotiation.floorPaise}
                max={quote.negotiation.ceilingPaise}
                step={100}
                value={proposedFarePaise}
                onChange={(e) => setProposedFarePaise(Number(e.target.value))}
                className="w-full accent-interactive cursor-pointer h-1.5"
              />

              <div className="flex items-center justify-between text-[11px] text-text-subtle">
                <button
                  type="button"
                  onClick={() => setProposedFarePaise(quote.negotiation.floorPaise)}
                  className="hover:underline"
                >
                  Floor: {formatPaise(quote.negotiation.floorPaise)}
                </button>
                <button
                  type="button"
                  onClick={() => setProposedFarePaise(quote.suggestedFarePaise)}
                  className="hover:underline font-semibold text-interactive"
                >
                  Suggested: {formatPaise(quote.suggestedFarePaise)}
                </button>
                <button
                  type="button"
                  onClick={() => setProposedFarePaise(quote.negotiation.ceilingPaise)}
                  className="hover:underline"
                >
                  Ceiling: {formatPaise(quote.negotiation.ceilingPaise)}
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <Button
              variant="secondary"
              onClick={() => void handleCalculateQuote()}
              loading={quoteLoading}
              className="flex-1"
            >
              <Receipt className="size-4" />
              <span>1. Preview Fare Quote</span>
            </Button>

            <Button
              variant="primary"
              onClick={() => void handleRequestRide()}
              loading={rideLoading}
              className="flex-[2] bg-interactive hover:bg-interactive-hover text-white"
            >
              <Zap className="size-4" />
              <span>
                {quote
                  ? `2. Broadcast Ride Offer (${formatPaise(proposedFarePaise)})`
                  : '⚡ Quick Quote & Broadcast Offer to Driver App'}
              </span>
            </Button>
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): LIVE RIDE EXECUTION, 4-DIGIT OTP & PAYMENT/COMMISSION */}
        <div className="lg:col-span-5 flex flex-col gap-4 p-5 rounded-xl border border-border-strong bg-surface shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-success/10 text-success">
                <Car className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text">
                  3 & 4. Ride Execution, OTP & Commission Monitor
                </h3>
                <p className="text-xs text-text-subtle">
                  Auto-syncs every 2s with your Driver App — or click the Driver Simulator actions below.
                </p>
              </div>
            </div>
            {activeRide ? (
              <Badge
                tone={
                  activeRide.status === 'SETTLED'
                    ? 'success'
                    : activeRide.status === 'CANCELLED' || activeRide.status === 'PAYMENT_DISPUTED'
                      ? 'danger'
                      : 'accent'
                }
              >
                {activeRide.status}
              </Badge>
            ) : (
              <Badge tone="neutral">No Active Ride</Badge>
            )}
          </div>

          {!activeRide ? (
            <div className="p-10 text-center flex flex-col items-center gap-3 bg-surface-muted/30 rounded-xl border border-dashed border-border">
              <Sparkles className="size-7 text-text-subtle" />
              <p className="text-sm font-medium text-text">Ready to Test Driver App Dispatch</p>
              <p className="text-xs text-text-subtle max-w-xs">
                1. Go <strong>ONLINE</strong> on the Driver App (or click <strong>Put Driver Online Here</strong> above).<br />
                2. Click <strong>Broadcast Offer</strong> on the left.<br />
                3. Accept the offer on the Driver App (or here) to reveal the <strong>4-digit Pickup OTP</strong>!
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 text-xs">
              {/* Prominent 4-Digit Pickup OTP Box */}
              {activeRide.pickupOtp &&
                ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED'].includes(
                  activeRide.status,
                ) && (
                  <div className="p-4 rounded-xl border-2 border-interactive bg-interactive/10 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-interactive flex items-center gap-1.5">
                        <Key className="size-3.5" />
                        <span>Customer 4-Digit Pickup OTP</span>
                      </span>
                      <div className="text-3xl font-mono font-extrabold tracking-[0.25em] text-text mt-1">
                        {activeRide.pickupOtp}
                      </div>
                      <span className="text-[11px] text-text-subtle block mt-1">
                        Enter this code in the Driver App after tapping &ldquo;Arrived&rdquo;
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (activeRide.pickupOtp && typeof navigator !== 'undefined') {
                          void navigator.clipboard.writeText(activeRide.pickupOtp);
                          setOtpCopied(true);
                          setTimeout(() => setOtpCopied(false), 1800);
                        }
                      }}
                    >
                      <Copy className="size-3.5" />
                      <span>{otpCopied ? 'Copied' : 'Copy'}</span>
                    </Button>
                  </div>
                )}

              {/* Step-by-Step Driver App Guide + Interactive Simulator Mirror Controls */}
              <div className="flex flex-col gap-2">
                {RIDE_STAGE_STEPS.map((step) => {
                  const currentIdx = RIDE_STAGE_STEPS.findIndex(
                    (s) => s.status === activeRide.status,
                  );
                  const stepIdx = RIDE_STAGE_STEPS.findIndex((s) => s.status === step.status);
                  const isCurrent = activeRide.status === step.status;
                  const isDone = currentIdx > stepIdx || activeRide.status === 'SETTLED';

                  return (
                    <div
                      key={step.status}
                      className={`p-2.5 rounded-lg border transition-all ${
                        isCurrent
                          ? 'border-interactive bg-interactive/10 shadow-xs'
                          : isDone
                            ? 'border-success/30 bg-success/5 opacity-80'
                            : 'border-border bg-surface-muted/20 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-text flex items-center gap-1.5">
                          {isDone ? (
                            <CheckCircle2 className="size-3.5 text-success" />
                          ) : isCurrent ? (
                            <Clock className="size-3.5 text-interactive animate-pulse" />
                          ) : (
                            <span className="size-3.5 rounded-full border border-border inline-block" />
                          )}
                          {step.label}
                        </span>
                        {isCurrent && (
                          <Badge tone="accent" className="text-[10px]">
                            CURRENT STEP
                          </Badge>
                        )}
                      </div>
                      {isCurrent && (
                        <div className="mt-1.5 pl-5 flex flex-col gap-2">
                          <p className="text-[11px] text-text-subtle">{step.driverHint}</p>
                          {step.status === 'OFFERING' && (
                            <div className="flex flex-wrap gap-1.5">
                              <Button
                                size="sm"
                                variant="primary"
                                loading={driverActionLoading}
                                onClick={() => void handleSimulateDriverAction('ACCEPT')}
                                className="h-7 text-[11px] px-2.5"
                              >
                                ✓ Simulate Driver Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                loading={driverActionLoading}
                                onClick={() => void handleSimulateDriverAction('COUNTER')}
                                className="h-7 text-[11px] px-2.5"
                              >
                                ⇄ Simulate Driver Counter (+₹30)
                              </Button>
                            </div>
                          )}
                          {step.status === 'DRIVER_ASSIGNED' && (
                            <div>
                              <Button
                                size="sm"
                                variant="primary"
                                loading={driverActionLoading}
                                onClick={() => void handleSimulateDriverAction('EN_ROUTE')}
                                className="h-7 text-[11px] px-2.5"
                              >
                                → Simulate Driver En Route
                              </Button>
                            </div>
                          )}
                          {step.status === 'DRIVER_EN_ROUTE' && (
                            <div>
                              <Button
                                size="sm"
                                variant="primary"
                                loading={driverActionLoading}
                                onClick={() => void handleSimulateDriverAction('ARRIVED')}
                                className="h-7 text-[11px] px-2.5"
                              >
                                📍 Simulate Driver Arrived at Pickup
                              </Button>
                            </div>
                          )}
                          {step.status === 'DRIVER_ARRIVED' && (
                            <div>
                              <Button
                                size="sm"
                                variant="primary"
                                loading={driverActionLoading}
                                onClick={() => void handleSimulateDriverAction('START_OTP')}
                                className="h-7 text-[11px] px-2.5"
                              >
                                🔑 Verify OTP ({activeRide.pickupOtp ?? '----'}) & Start Trip
                              </Button>
                            </div>
                          )}
                          {step.status === 'TRIP_STARTED' && (
                            <div>
                              <Button
                                size="sm"
                                variant="primary"
                                loading={driverActionLoading}
                                onClick={() => void handleSimulateDriverAction('COMPLETE')}
                                className="h-7 text-[11px] px-2.5"
                              >
                                🏁 Simulate Complete Trip at Drop
                              </Button>
                            </div>
                          )}
                          {step.status === 'PAYMENT_PENDING' && (
                            <div>
                              <Button
                                size="sm"
                                variant="primary"
                                loading={driverActionLoading}
                                onClick={() => void handleSimulateDriverAction('CONFIRM_PAYMENT')}
                                className="h-7 text-[11px] px-2.5"
                              >
                                ₹ Confirm Cash/UPI Payment & Settle 8% Fee
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Payment & 8% Commission Breakdown Card */}
              <div className="p-3.5 rounded-xl border border-border bg-surface-sunken flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-text flex items-center gap-1.5">
                    <Wallet className="size-3.5 text-interactive" />
                    <span>Payment & Commission (8%)</span>
                  </span>
                  <span className="font-mono text-[11px] text-text-subtle">
                    Ride #{activeRide.id.slice(0, 8)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="p-2 rounded bg-surface border border-border">
                    <span className="text-[10px] text-text-subtle block">Customer Fare</span>
                    <span className="font-bold text-sm text-text">
                      {formatPaise(activeFarePaise)}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-surface border border-border">
                    <span className="text-[10px] text-text-subtle block">8% Commission</span>
                    <span className="font-bold text-sm text-danger">
                      -{formatPaise(activeCommissionPaise)}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-surface border border-border">
                    <span className="text-[10px] text-text-subtle block">Driver Net</span>
                    <span className="font-bold text-sm text-success">
                      {formatPaise(Math.max(0, activeFarePaise - activeCommissionPaise))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Post-Settlement Payment Dispute & Resolution Tester */}
              {activeRide.status === 'SETTLED' && (
                <div className="p-3.5 rounded-xl border border-warning/40 bg-warning/5 flex flex-col gap-2.5">
                  <span className="font-semibold text-text flex items-center gap-1.5">
                    <ShieldAlert className="size-4 text-warning" />
                    <span>Test Post-Ride Payment Dispute & Commission Refund</span>
                  </span>
                  <Input
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="Reason for payment dispute (min 10 chars)"
                    className="h-8 text-xs"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleFileDispute}
                    loading={rideLoading}
                  >
                    <span>File Payment Dispute as Customer</span>
                  </Button>
                </div>
              )}

              {activeRide.status === 'PAYMENT_DISPUTED' && (
                <div className="p-3.5 rounded-xl border border-danger/40 bg-danger/5 flex flex-col gap-2.5">
                  <span className="font-semibold text-danger flex items-center gap-1.5">
                    <AlertCircle className="size-4" />
                    <span>Payment Disputed — Resolve to Test Driver Ledger Refund</span>
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleResolveDispute('RIDER_WINS')}
                      loading={rideLoading}
                    >
                      <span>Rider Wins (Refund 8%)</span>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleResolveDispute('DRIVER_WINS')}
                      loading={rideLoading}
                    >
                      <span>Driver Wins (Keep)</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* Driver Counter-Offers (driver negotiated from the Driver App) */}
              {activeRide.status === 'OFFERING' && (
                <div className="p-3 rounded-md border border-border bg-surface-muted/40 flex flex-col gap-2">
                  <span className="text-[11px] font-semibold text-text">
                    {pendingCounters.length === 0
                      ? 'Waiting for a driver to accept or counter in the Driver App...'
                      : 'Driver counter-offers'}
                  </span>
                  {pendingCounters.map((c) => (
                    <div
                      key={c.driverId}
                      className="flex items-center justify-between gap-2 text-xs p-2 rounded border border-warning/40 bg-warning/10"
                    >
                      <span className="font-mono">
                        Driver {c.driverId.slice(0, 8)} wants{' '}
                        <b>{formatPaise(c.farePaise)}</b> (you offered{' '}
                        {formatPaise(activeRide.proposedFarePaise ?? activeRide.suggestedFarePaise)})
                      </span>
                      <span className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="primary"
                          loading={rideLoading}
                          onClick={() => void handleCounterResponse(c.driverId, 'ACCEPTED')}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={rideLoading}
                          onClick={() => void handleCounterResponse(c.driverId, 'REJECTED')}
                        >
                          Reject
                        </Button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Customer Cancellation Control */}
              {['OFFERING', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED'].includes(
                activeRide.status,
              ) && (
                <div className="pt-2 border-t border-border flex items-center gap-2">
                  <div className="flex-1">
                    <Select
                      value={cancelReason}
                      onValueChange={(val) => setCancelReason(val as CancellationReason)}
                      options={[
                        { value: 'RIDER_CHANGED_MIND', label: 'Cancel: Customer Changed Mind' },
                        { value: 'DRIVER_DELAYED', label: 'Cancel: Driver Delayed' },
                        { value: 'FARE_DISAGREEMENT', label: 'Cancel: Fare Disagreement' },
                      ]}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCustomerCancel}
                    loading={rideLoading}
                    className="text-danger"
                  >
                    <XCircle className="size-3.5" />
                    <span>Cancel Ride</span>
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 5: DRIVER EARNINGS, WALLET LEDGER & RIDE HISTORY INSPECTOR */}
      <div className="p-5 rounded-xl border border-border-strong bg-surface flex flex-col gap-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-text">
              5. Driver Earnings, Wallet Ledger & Ride History Inspector
            </h3>
            <p className="text-xs text-text-subtle">
              Authoritative backend numbers for{' '}
              <strong>{selectedDriver?.name ?? 'Selected Driver'}</strong> — verify these match the Earnings, Wallet, and History screens on the Driver App.
            </p>
          </div>

          <SegmentedControl<'wallet' | 'history' | 'events'>
            label="Inspector View"
            value={inspectorTab}
            onValueChange={setInspectorTab}
            segments={[
              {
                value: 'wallet',
                label: `Wallet Ledger (${driverWalletView?.transactions?.length ?? 0})`,
                icon: <Wallet className="size-3.5" />,
              },
              {
                value: 'history',
                label: `Driver Ride History (${driverRides.length})`,
                icon: <History className="size-3.5" />,
              },
              {
                value: 'events',
                label: `Active Ride Audit (${rideEvents.length})`,
                icon: <CheckCircle2 className="size-3.5" />,
              },
            ]}
          />
        </div>

        {/* Driver Earnings & Wallet KPI Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile
            label="Gross Ride Earnings"
            value={formatPaise(driverMetrics.grossEarningsPaise)}
            hint={`${driverMetrics.completedCount} settled trips`}
            tone="default"
          />
          <StatTile
            label="Platform Commission (8%)"
            value={`-${formatPaise(driverMetrics.netCommissionPaise)}`}
            hint="Debited from prepaid wallet"
            tone="warning"
          />
          <StatTile
            label="Net Driver Take-Home"
            value={formatPaise(driverMetrics.netTakeHomePaise)}
            hint="Gross cash/UPI minus 8% fee"
            tone="success"
          />
          <StatTile
            label="Current Wallet Balance"
            value={formatPaise(driverMetrics.balancePaise)}
            hint={
              driverMetrics.isDispatchEligible
                ? 'Positive balance (Dispatch Eligible)'
                : '≤ ₹0 (Blocked from new offers)'
            }
            tone={driverMetrics.isDispatchEligible ? 'success' : 'danger'}
          />
        </div>

        {/* Tab 1: Wallet Ledger Transactions */}
        {inspectorTab === 'wallet' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-surface-muted/40 border border-border text-xs">
              <span className="font-medium text-text">
                Simulate Wallet Adjustments (test recharge, commission debit, or zero-balance lock):
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={walletActionLoading || !selectedDriverId}
                  onClick={() =>
                    handleAdjustDriverWallet('CREDIT', 10000, 'Manual test recharge (+₹100)')
                  }
                >
                  <PlusCircle className="size-3.5 text-success" />
                  <span>+₹100 Credit</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={walletActionLoading || !selectedDriverId}
                  onClick={() =>
                    handleAdjustDriverWallet('CREDIT', 50000, 'Manual test recharge (+₹500)')
                  }
                >
                  <PlusCircle className="size-3.5 text-success" />
                  <span>+₹500 Credit</span>
                </Button>
                {driverMetrics.balancePaise > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={walletActionLoading || !selectedDriverId}
                    onClick={() =>
                      handleAdjustDriverWallet(
                        'DEBIT',
                        driverMetrics.balancePaise,
                        'Drain balance to ₹0 to test dispatch restriction',
                      )
                    }
                  >
                    <XCircle className="size-3.5 text-danger" />
                    <span>Drain to ₹0 (Test Block)</span>
                  </Button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/60 text-text-subtle">
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Reference</th>
                    <th className="px-4 py-2.5">Amount</th>
                    <th className="px-4 py-2.5">Balance Before → After</th>
                    <th className="px-4 py-2.5">Note / Ride ID</th>
                    <th className="px-4 py-2.5">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(driverWalletView?.transactions ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-text-subtle">
                        No wallet ledger transactions recorded yet for this driver.
                      </td>
                    </tr>
                  ) : (
                    (driverWalletView?.transactions ?? []).map((tx) => (
                      <tr key={tx.id} className="hover:bg-surface-muted/30">
                        <td className="px-4 py-2.5">
                          <Badge tone={tx.type === 'CREDIT' ? 'success' : 'danger'}>
                            {tx.type}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-medium text-text">
                          {tx.referenceType}
                        </td>
                        <td
                          className={`px-4 py-2.5 font-mono font-bold ${
                            tx.type === 'CREDIT' ? 'text-success' : 'text-danger'
                          }`}
                        >
                          {tx.type === 'CREDIT' ? '+' : '-'}
                          {formatPaise(tx.amountPaise)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-text-subtle">
                          {formatPaise(tx.balanceBeforePaise)} →{' '}
                          <strong className="text-text">{formatPaise(tx.balanceAfterPaise)}</strong>
                        </td>
                        <td className="px-4 py-2.5 text-text-subtle">
                          {tx.note || (tx.referenceId ? `Ride ${tx.referenceId.slice(0, 8)}...` : '—')}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-text-subtle">
                          {new Date(tx.createdAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Driver Ride History */}
        {inspectorTab === 'history' && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-muted/60 text-text-subtle">
                  <th className="px-4 py-2.5">Ride ID</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Passenger</th>
                  <th className="px-4 py-2.5">Distance</th>
                  <th className="px-4 py-2.5">Agreed Fare</th>
                  <th className="px-4 py-2.5">8% Commission</th>
                  <th className="px-4 py-2.5">Created</th>
                  <th className="px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {driverRides.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-text-subtle">
                      No rides assigned to this driver yet.
                    </td>
                  </tr>
                ) : (
                  driverRides.map((r) => {
                    const fare = r.agreedFarePaise ?? r.proposedFarePaise ?? r.suggestedFarePaise;
                    const comm = Math.round(fare * 0.08);
                    return (
                      <tr key={r.id} className="hover:bg-surface-muted/30">
                        <td className="px-4 py-2.5 font-mono text-text">{r.id.slice(0, 10)}...</td>
                        <td className="px-4 py-2.5">
                          <Badge
                            tone={
                              r.status === 'SETTLED'
                                ? 'success'
                                : r.status === 'CANCELLED' || r.status === 'PAYMENT_DISPUTED'
                                  ? 'danger'
                                  : 'accent'
                            }
                          >
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-text">
                          {r.passenger.name} ({r.passenger.phoneE164})
                        </td>
                        <td className="px-4 py-2.5 font-mono text-text-subtle">
                          {(r.routeSnapshot.distanceM / 1000).toFixed(2)} km
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-text">
                          {formatPaise(fare)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-danger">
                          {r.status === 'SETTLED' ? `-${formatPaise(comm)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-text-subtle">
                          {new Date(r.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-2.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setActiveRide(r);
                              void refreshActiveRideStatus(r.id);
                            }}
                            className="h-7 text-[11px] px-2"
                          >
                            Inspect
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Active Ride Event Audit Trail */}
        {inspectorTab === 'events' && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-muted/60 text-text-subtle">
                  <th className="px-4 py-2.5">Event Type</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">Transition</th>
                  <th className="px-4 py-2.5">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rideEvents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-text-subtle">
                      Select or broadcast a ride to view its immutable state-transition audit log.
                    </td>
                  </tr>
                ) : (
                  rideEvents.map((ev) => (
                    <tr key={ev.id} className="hover:bg-surface-muted/30">
                      <td className="px-4 py-2.5 font-mono font-semibold text-text">
                        {ev.eventType}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone="neutral">{ev.actorType}</Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-text-subtle">
                        {ev.previousStatus ?? '—'} →{' '}
                        <strong className="text-text">{ev.newStatus ?? '—'}</strong>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-text-subtle">
                        {new Date(ev.createdAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
