import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import type { RideDto, WalletTransactionDto } from '@cabzone/contracts';
import { dispatchApi, isApiError, ridesApi, walletApi } from '@/services/api';
import { startBackgroundLocation, stopBackgroundLocation } from '@/services/background-location';
import { useAuth } from './auth-context';

export type DutyStatus = 'ONLINE' | 'OFFLINE';
export type LocationStatus = 'INITIAL' | 'PERMITTED' | 'DENIED' | 'TRANSMITTING' | 'STALE' | 'ERROR';

export interface DriverCoords {
  lat: number;
  lng: number;
  heading: number | null;
  speedMps: number | null;
  accuracy: number | null;
  timestamp: number;
}

const ACTIVE_RIDE_STATUSES: ReadonlySet<string> = new Set([
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
  'TRIP_COMPLETED',
  'PAYMENT_PENDING',
]);

interface DutyContextType {
  status: DutyStatus;
  isToggling: boolean;
  locationStatus: LocationStatus;
  coords: DriverCoords | null;
  lastTransmittedAt: Date | null;
  walletBalancePaise: number | null;
  walletTransactions: WalletTransactionDto[];
  myRides: RideDto[];
  todayEarningsPaise: number;
  todayGrossPaise: number;
  todayCommissionPaise: number;
  todayCompletedTrips: number;
  useDevSimulatedLocation: boolean;
  setUseDevSimulatedLocation: (enabled: boolean) => void;
  error: string | null;
  clearError: () => void;
  goOnline: () => Promise<boolean>;
  goOffline: () => Promise<boolean>;
  refreshSummary: () => Promise<void>;
}

const DutyContext = createContext<DutyContextType | undefined>(undefined);

// Explicit dev simulation coordinates for Siliguri center (only used when dev simulation is opted in)
const SILIGURI_DEV_SIMULATION: DriverCoords = {
  lat: 26.7271,
  lng: 88.4334,
  heading: 90,
  speedMps: 0,
  accuracy: 10,
  timestamp: Date.now(),
};

export function computeRideEarningsBreakdown(ride: RideDto): {
  grossPaise: number;
  commissionPaise: number;
  netPaise: number;
} {
  const grossPaise =
    ride.agreedFarePaise ?? ride.proposedFarePaise ?? ride.suggestedFarePaise ?? 0;
  const commissionPercent = ride.pricingSnapshot?.commissionPercent ?? 8;
  const commissionPaise = Math.round((grossPaise * commissionPercent) / 100);
  const netPaise = Math.max(0, grossPaise - commissionPaise);
  return { grossPaise, commissionPaise, netPaise };
}

export function DutyProvider({ children }: { children: React.ReactNode }) {
  const { token, user, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<DutyStatus>('OFFLINE');
  const [isToggling, setIsToggling] = useState(false);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('INITIAL');
  const [coords, setCoords] = useState<DriverCoords | null>(null);
  const [lastTransmittedAt, setLastTransmittedAt] = useState<Date | null>(null);
  const [walletBalancePaise, setWalletBalancePaise] = useState<number | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransactionDto[]>([]);
  const [myRides, setMyRides] = useState<RideDto[]>([]);
  const [todayEarningsPaise, setTodayEarningsPaise] = useState<number>(0);
  const [todayGrossPaise, setTodayGrossPaise] = useState<number>(0);
  const [todayCommissionPaise, setTodayCommissionPaise] = useState<number>(0);
  const [todayCompletedTrips, setTodayCompletedTrips] = useState<number>(0);
  const [useDevSimulatedLocation, setUseDevSimulatedLocation] = useState<boolean>(__DEV__);
  const [error, setError] = useState<string | null>(null);

  const trackingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightLocationRef = useRef<boolean>(false);
  const statusRef = useRef<DutyStatus>('OFFLINE');
  const devSimRef = useRef<boolean>(useDevSimulatedLocation);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    devSimRef.current = useDevSimulatedLocation;
  }, [useDevSimulatedLocation]);

  const stopTelemetryLoop = useCallback(() => {
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }
    inFlightLocationRef.current = false;
  }, []);

  // Reset duty state on logout or user identity switch
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (!isAuthenticated || (lastUserIdRef.current && lastUserIdRef.current !== currentUserId)) {
      stopTelemetryLoop();
      void stopBackgroundLocation().catch(() => {});
      setStatus('OFFLINE');
      setLocationStatus('INITIAL');
      setCoords(null);
      setLastTransmittedAt(null);
      setWalletBalancePaise(null);
      setWalletTransactions([]);
      setMyRides([]);
      setTodayEarningsPaise(0);
      setTodayGrossPaise(0);
      setTodayCommissionPaise(0);
      setTodayCompletedTrips(0);
      setError(null);
    }
    lastUserIdRef.current = currentUserId;
  }, [isAuthenticated, user?.id, stopTelemetryLoop]);

  // Refresh driver wallet and accurate ride-derived earnings summary
  const refreshSummary = useCallback(async () => {
    if (!token) return;
    try {
      const [walletData, ridesList] = await Promise.all([
        walletApi.getMyWallet(token),
        ridesApi.listMyRides(token, { limit: 100 }).catch(() => [] as RideDto[]),
      ]);

      if (walletData?.wallet) {
        setWalletBalancePaise(walletData.wallet.balancePaise);
      }
      if (walletData?.transactions) {
        setWalletTransactions(walletData.transactions);
      }

      setMyRides(ridesList);

      const todayStr = new Date().toDateString();
      const todaysSettledRides = ridesList.filter((r) => {
        if (r.status !== 'SETTLED' && r.status !== 'PAYMENT_CONFIRMED' && r.status !== 'TRIP_COMPLETED') {
          return false;
        }
        const timestamp = r.settledAt || r.completedAt || r.updatedAt || r.createdAt;
        return Boolean(timestamp && new Date(timestamp).toDateString() === todayStr);
      });

      let grossSum = 0;
      let commissionSum = 0;
      let netSum = 0;
      for (const r of todaysSettledRides) {
        const b = computeRideEarningsBreakdown(r);
        grossSum += b.grossPaise;
        commissionSum += b.commissionPaise;
        netSum += b.netPaise;
      }

      setTodayGrossPaise(grossSum);
      setTodayCommissionPaise(commissionSum);
      setTodayEarningsPaise(netSum);
      setTodayCompletedTrips(todaysSettledRides.length);
    } catch {
      // ignore background summary error
    }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void refreshSummary();
    }
  }, [isAuthenticated, refreshSummary]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
      }
    };
  }, []);

  // Request high-accuracy current location; use Siliguri coordinates immediately when Dev Sim is opted in or when emulator GPS times out
  const obtainCurrentLocation = useCallback(async (): Promise<DriverCoords> => {
    if (__DEV__ && devSimRef.current) {
      return {
        ...SILIGURI_DEV_SIMULATION,
        timestamp: Date.now(),
      };
    }

    try {
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('GPS_TIMEOUT')), 2500),
        ),
      ]);

      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading ?? null,
        speedMps: pos.coords.speed ?? null,
        accuracy: pos.coords.accuracy ?? null,
        timestamp: pos.timestamp,
      };
    } catch (err: unknown) {
      if (__DEV__) {
        return {
          ...SILIGURI_DEV_SIMULATION,
          timestamp: Date.now(),
        };
      }
      throw err instanceof Error
        ? err
        : new Error('Unable to obtain GPS coordinates. Enable location services and try again.');
    }
  }, []);

  // Transmission loop: Sends location update every 3.5 seconds with single-flight guard and automatic re-online recovery
  const startTelemetryLoop = useCallback(() => {
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
    }

    const transmitOnce = async () => {
      if (statusRef.current !== 'ONLINE' || !token || inFlightLocationRef.current) {
        return;
      }

      inFlightLocationRef.current = true;
      let current: DriverCoords | null = null;
      try {
        current = await obtainCurrentLocation();
        setCoords(current);
        await dispatchApi.updateLocation(token, {
          lat: current.lat,
          lng: current.lng,
          heading: current.heading,
          speedMps: current.speedMps,
        });
        setLastTransmittedAt(new Date());
        setLocationStatus('TRANSMITTING');
      } catch (err: unknown) {
        // If server presence expired or API restarted while driver was ONLINE, re-register ONLINE seamlessly
        if (
          current &&
          statusRef.current === 'ONLINE' &&
          isApiError(err) &&
          err.status === 409
        ) {
          try {
            const restored = await dispatchApi.setStatus(token, 'ONLINE', {
              lat: current.lat,
              lng: current.lng,
            });
            if (restored.status === 'ONLINE') {
              setLastTransmittedAt(new Date());
              setLocationStatus('TRANSMITTING');
              return;
            }
          } catch {
            setStatus('OFFLINE');
            stopTelemetryLoop();
            return;
          }
        }
        setLocationStatus('STALE');
      } finally {
        inFlightLocationRef.current = false;
      }
    };

    void transmitOnce();
    trackingIntervalRef.current = setInterval(() => {
      void transmitOnce();
    }, 3500);
  }, [token, obtainCurrentLocation, stopTelemetryLoop]);

  // Keep the active interval in sync with the latest startTelemetryLoop closure across Fast Refresh
  useEffect(() => {
    if (status === 'ONLINE' && token) {
      startTelemetryLoop();
      return () => {
        stopTelemetryLoop();
      };
    }
    stopTelemetryLoop();
    return undefined;
  }, [status, token, startTelemetryLoop, stopTelemetryLoop]);

  useEffect(() => {
    if (!token || !isAuthenticated) return;
    let cancelled = false;
    void dispatchApi
      .getStatus(token)
      .then(async (server) => {
        if (cancelled) return;
        if (server.status === 'OFFLINE') {
          if (statusRef.current === 'ONLINE') {
            const current = await obtainCurrentLocation();
            if (cancelled) return;
            server = await dispatchApi.setStatus(token, 'ONLINE', {
              lat: current.lat,
              lng: current.lng,
            });
          } else {
            const active = await ridesApi.listMyRides(token, {
              status: Array.from(ACTIVE_RIDE_STATUSES) as RideDto['status'][],
              limit: 1,
            });
            if (cancelled) return;
            if (active.length > 0) {
              const current = await obtainCurrentLocation();
              if (cancelled) return;
              server = await dispatchApi.setStatus(token, 'ONLINE', {
                lat: current.lat,
                lng: current.lng,
              });
            }
          }
        }
        if (cancelled) return;
        if (server.status === 'ONLINE') {
          setStatus('ONLINE');
          startTelemetryLoop();
          await startBackgroundLocation().catch(() => false);
        } else {
          setStatus('OFFLINE');
          stopTelemetryLoop();
          await stopBackgroundLocation().catch(() => {});
        }
      })
      .catch(() => {
        if (!cancelled)
          setError(
            'Unable to restore your current ride location. Check GPS and connection, then try again.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [token, isAuthenticated, obtainCurrentLocation, startTelemetryLoop, stopTelemetryLoop]);

  // GO ONLINE command (Section 8)
  const goOnline = useCallback(async (): Promise<boolean> => {
    if (!token) {
      setError('You must be logged in to go online.');
      return false;
    }

    setError(null);
    setIsToggling(true);

    try {
      // 1. Contextual Location Permission Check
      if (!(__DEV__ && devSimRef.current)) {
        const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
        if (permStatus !== 'granted') {
          setLocationStatus('DENIED');
          setError(
            'Location permission is required to receive nearby ride offers. Please grant location access in system settings.',
          );
          return false;
        }
      }
      setLocationStatus('PERMITTED');

      // 2. Obtain fresh location
      let initialCoords: DriverCoords;
      try {
        initialCoords = await obtainCurrentLocation();
      } catch {
        setLocationStatus('ERROR');
        setError(
          'Could not read your current GPS location. Please turn on device GPS or move to an open area.',
        );
        return false;
      }
      setCoords(initialCoords);

      // 3. Send authoritative backend command
      const res = await dispatchApi.setStatus(token, 'ONLINE', {
        lat: initialCoords.lat,
        lng: initialCoords.lng,
      });

      if (res.status === 'ONLINE') {
        setStatus('ONLINE');
        setLastTransmittedAt(new Date());
        setLocationStatus('TRANSMITTING');
        startTelemetryLoop();
        if (Platform.OS === 'android' && !(__DEV__ && devSimRef.current)) {
          const backgroundPermission = await Location.getBackgroundPermissionsAsync();
          if (backgroundPermission.status === 'granted') {
            void startBackgroundLocation().catch(() => {});
          } else {
            Alert.alert(
              'Receive rides in the background',
              'Allow background location so Cabzone can keep your position fresh while you are online. Android will show a persistent location notification.',
              [
                { text: 'Not now', style: 'cancel' },
                {
                  text: 'Continue',
                  onPress: () => {
                    void Location.requestBackgroundPermissionsAsync()
                      .then((permission) =>
                        permission.status === 'granted' ? startBackgroundLocation() : false,
                      )
                      .catch(() => false);
                  },
                },
              ],
            );
          }
        }
        await refreshSummary();
        return true;
      } else {
        setStatus('OFFLINE');
        return false;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to go online';
      setError(errMsg);
      setStatus('OFFLINE');
      return false;
    } finally {
      setIsToggling(false);
    }
  }, [token, obtainCurrentLocation, startTelemetryLoop, refreshSummary]);

  // GO OFFLINE command — only stop telemetry AFTER server confirms OFFLINE, and block if active ride exists
  const goOffline = useCallback(async (): Promise<boolean> => {
    if (!token) return false;

    const hasActiveRide = myRides.some((r) => ACTIVE_RIDE_STATUSES.has(r.status));
    if (hasActiveRide) {
      setError('Complete or settle your active ride before going offline.');
      return false;
    }

    setError(null);
    setIsToggling(true);

    try {
      await dispatchApi.setStatus(token, 'OFFLINE');
      stopTelemetryLoop();
      void stopBackgroundLocation().catch(() => {});
      setStatus('OFFLINE');
      setLocationStatus('INITIAL');
      return true;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to go offline';
      setError(errMsg);
      return false;
    } finally {
      setIsToggling(false);
    }
  }, [token, myRides, stopTelemetryLoop]);

  return (
    <DutyContext.Provider
      value={{
        status,
        isToggling,
        locationStatus,
        coords,
        lastTransmittedAt,
        walletBalancePaise,
        walletTransactions,
        myRides,
        todayEarningsPaise,
        todayGrossPaise,
        todayCommissionPaise,
        todayCompletedTrips,
        useDevSimulatedLocation,
        setUseDevSimulatedLocation,
        error,
        clearError: () => setError(null),
        goOnline,
        goOffline,
        refreshSummary,
      }}>
      {children}
    </DutyContext.Provider>
  );
}

export function useDuty() {
  const context = useContext(DutyContext);
  if (!context) {
    throw new Error('useDuty must be used within a DutyProvider');
  }
  return context;
}
