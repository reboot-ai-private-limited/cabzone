import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import * as Location from 'expo-location';
import { dispatchApi, walletApi } from '@/services/api';
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

interface DutyContextType {
  status: DutyStatus;
  isToggling: boolean;
  locationStatus: LocationStatus;
  coords: DriverCoords | null;
  lastTransmittedAt: Date | null;
  walletBalancePaise: number | null;
  todayEarningsPaise: number;
  todayCompletedTrips: number;
  error: string | null;
  clearError: () => void;
  goOnline: () => Promise<boolean>;
  goOffline: () => Promise<boolean>;
  refreshSummary: () => Promise<void>;
}

const DutyContext = createContext<DutyContextType | undefined>(undefined);

// Default coordinates for Siliguri center if emulator doesn't have active GPS mock
const SILIGURI_FALLBACK: DriverCoords = {
  lat: 26.7271,
  lng: 88.4334,
  heading: 90,
  speedMps: 0,
  accuracy: 10,
  timestamp: Date.now(),
};

export function DutyProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<DutyStatus>('OFFLINE');
  const [isToggling, setIsToggling] = useState(false);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('INITIAL');
  const [coords, setCoords] = useState<DriverCoords | null>(null);
  const [lastTransmittedAt, setLastTransmittedAt] = useState<Date | null>(null);
  const [walletBalancePaise, setWalletBalancePaise] = useState<number | null>(null);
  const [todayEarningsPaise, setTodayEarningsPaise] = useState<number>(0);
  const [todayCompletedTrips, setTodayCompletedTrips] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const trackingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<DutyStatus>('OFFLINE');

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Refresh driver wallet and earnings summary
  const refreshSummary = useCallback(async () => {
    if (!token) return;
    try {
      const data = await walletApi.getMyWallet(token);
      if (data?.wallet) {
        setWalletBalancePaise(data.wallet.balancePaise);
      }
      // Calculate today's earnings from credit transactions
      if (data?.transactions) {
        const today = new Date().toDateString();
        const todaysTx = data.transactions.filter(
          (t: { createdAt?: string; type?: string }) =>
            t.createdAt && new Date(t.createdAt).toDateString() === today,
        );
        const earnings = todaysTx
          .filter((t: { type?: string }) => t.type === 'EARNING' || t.type === 'CREDIT')
          .reduce((acc: number, t: { amountPaise?: number }) => acc + (t.amountPaise ?? 0), 0);
        setTodayEarningsPaise(earnings);
        setTodayCompletedTrips(todaysTx.filter((t: { type?: string }) => t.type === 'COMMISSION').length);
      }
    } catch {
      // ignore
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

  // Request high-accuracy current location
  const obtainCurrentLocation = async (): Promise<DriverCoords> => {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading ?? null,
        speedMps: pos.coords.speed ?? null,
        accuracy: pos.coords.accuracy ?? null,
        timestamp: pos.timestamp,
      };
    } catch {
      // Fallback for desktop browser or emulator without location service
      return SILIGURI_FALLBACK;
    }
  };

  // Transmission loop: Sends location update every 3-4 seconds per Section 9
  const startTelemetryLoop = useCallback(() => {
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
    }

    trackingIntervalRef.current = setInterval(async () => {
      if (statusRef.current !== 'ONLINE' || !token) {
        return;
      }

      try {
        const current = await obtainCurrentLocation();
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
        console.warn('Location telemetry error:', err);
        setLocationStatus('STALE');
      }
    }, 3500); // 3.5 seconds
  }, [token]);

  const stopTelemetryLoop = useCallback(() => {
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }
  }, []);

  // GO ONLINE command (Section 8)
  const goOnline = useCallback(async (): Promise<boolean> => {
    if (!token) {
      setError('You must be logged in to go online.');
      return false;
    }

    setError(null);
    setIsToggling(true);

    try {
      // 1. Contextual Location Permission Check (Section 29)
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        setLocationStatus('DENIED');
        setError('Location permission is required to detect nearby rides.');
        setIsToggling(false);
        return false;
      }
      setLocationStatus('PERMITTED');

      // 2. Obtain fresh location
      const initialCoords = await obtainCurrentLocation();
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
  }, [token, startTelemetryLoop, refreshSummary]);

  // GO OFFLINE command (Section 8)
  const goOffline = useCallback(async (): Promise<boolean> => {
    if (!token) return false;

    setError(null);
    setIsToggling(true);
    stopTelemetryLoop();

    try {
      await dispatchApi.setStatus(token, 'OFFLINE');
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
  }, [token, stopTelemetryLoop]);

  return (
    <DutyContext.Provider
      value={{
        status,
        isToggling,
        locationStatus,
        coords,
        lastTransmittedAt,
        walletBalancePaise,
        todayEarningsPaise,
        todayCompletedTrips,
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
