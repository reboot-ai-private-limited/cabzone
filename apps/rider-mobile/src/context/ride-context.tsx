import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { CancellationReason, RideEventDto } from '@cabzone/contracts';
import {
  getRealtimeWsUrl,
  isApiError,
  riderRidesApi,
  type CreateRiderRidePayload,
  type RiderRideViewDto,
} from '@/services/api';
import {
  extractPendingDriverCounters,
  isRideActive,
  type PendingDriverCounter,
} from '@/services/rider-helpers';
import { useAuth } from './auth-context';

export interface BookingDraft {
  mode: 'IN_CITY' | 'OUTSTATION';
  preferredFarePaise?: number;
  vehicleCategory?: CreateRiderRidePayload['vehicleCategory'];
  pickup: {
    lat: number;
    lng: number;
    address: string;
  };
  drop: {
    lat: number;
    lng: number;
    address: string;
  };
}

interface RideContextValue {
  activeRide: RiderRideViewDto | null;
  activeRideEvents: RideEventDto[];
  pendingCounters: PendingDriverCounter[];
  rideHistory: RiderRideViewDto[];
  isLoadingRides: boolean;
  isRealtimeConnected: boolean;
  syncError: string | null;
  driverLiveLocation: { lat: number; lng: number; updatedAt: string } | null;
  bookingDraft: BookingDraft | null;
  setBookingDraft: (draft: BookingDraft | null) => void;
  refreshRides: () => Promise<RiderRideViewDto | null>;
  refreshRideById: (rideId: string) => Promise<{
    ride: RiderRideViewDto;
    events: RideEventDto[];
  } | null>;
  createRide: (payload: CreateRiderRidePayload) => Promise<RiderRideViewDto>;
  respondToCounter: (
    rideId: string,
    driverId: string,
    action: 'ACCEPTED' | 'REJECTED',
  ) => Promise<void>;
  raiseFare: (rideId: string, proposedFarePaise: number) => Promise<RiderRideViewDto>;
  cancelRide: (rideId: string, reason: CancellationReason) => Promise<RiderRideViewDto>;
  disputePayment: (rideId: string, reason: string) => Promise<RiderRideViewDto>;
}

const RideContext = createContext<RideContextValue | null>(null);

export function RideProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [activeRide, setActiveRide] = useState<RiderRideViewDto | null>(null);
  const [activeRideEvents, setActiveRideEvents] = useState<RideEventDto[]>([]);
  const [rideHistory, setRideHistory] = useState<RiderRideViewDto[]>([]);
  const [isFetchingRides, setIsFetchingRides] = useState(false);
  const [hydratedToken, setHydratedToken] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [driverLiveLocation, setDriverLiveLocation] = useState<{
    lat: number;
    lng: number;
    updatedAt: string;
  } | null>(null);
  const [bookingDraft, setBookingDraft] = useState<BookingDraft | null>(null);

  const isLoadingRides = isFetchingRides || Boolean(token && hydratedToken !== token);

  const activeRideIdRef = useRef<string | null>(null);
  const rideHistoryRef = useRef<RiderRideViewDto[]>([]);
  const maxVersionByRideRef = useRef<Record<string, number>>({});
  const lastTokenRef = useRef<string | null>(null);

  useEffect(() => {
    activeRideIdRef.current = activeRide?.id ?? null;
  }, [activeRide?.id]);

  useEffect(() => {
    rideHistoryRef.current = rideHistory;
  }, [rideHistory]);

  useEffect(() => {
    if (lastTokenRef.current !== token) {
      lastTokenRef.current = token;
      maxVersionByRideRef.current = {};
    }
  }, [token]);

  const recordRideVersion = useCallback((ride: RiderRideViewDto): boolean => {
    if (typeof ride.version !== 'number') return true;
    const seen = maxVersionByRideRef.current[ride.id];
    if (seen !== undefined && ride.version < seen) {
      return false;
    }
    maxVersionByRideRef.current[ride.id] = ride.version;
    return true;
  }, []);

  const handleSyncError = useCallback((error: unknown) => {
    if (isApiError(error) && error.code === 'SESSION_CHANGED') return;
    setSyncError(error instanceof Error ? error.message : 'Unable to sync rides.');
  }, []);

  const refreshRideById = useCallback(
    async (rideId: string): Promise<{ ride: RiderRideViewDto; events: RideEventDto[] } | null> => {
      if (!token) return null;
      const [ride, events] = await Promise.all([
        riderRidesApi.getRide(token, rideId),
        riderRidesApi.getRideEvents(token, rideId).catch(() => [] as RideEventDto[]),
      ]);
      setSyncError(null);
      if (!recordRideVersion(ride)) {
        const cached = rideHistoryRef.current.find((r) => r.id === ride.id);
        return cached ? { ride: cached, events } : null;
      }
      if (isRideActive(ride.status)) {
        if (activeRideIdRef.current !== ride.id) setDriverLiveLocation(null);
        activeRideIdRef.current = ride.id;
        setActiveRide(ride);
        setActiveRideEvents(events);
      } else if (activeRideIdRef.current === ride.id) {
        activeRideIdRef.current = null;
        setActiveRide(null);
        setActiveRideEvents([]);
      }
      setRideHistory((prev) => {
        const exists = prev.some((r) => r.id === ride.id);
        const next = !exists ? [ride, ...prev] : prev.map((r) => (r.id === ride.id ? ride : r));
        rideHistoryRef.current = next;
        return next;
      });
      return { ride, events };
    },
    [recordRideVersion, token],
  );

  const refreshRides = useCallback(async (): Promise<RiderRideViewDto | null> => {
    if (!token) {
      activeRideIdRef.current = null;
      rideHistoryRef.current = [];
      maxVersionByRideRef.current = {};
      setActiveRide(null);
      setActiveRideEvents([]);
      setRideHistory([]);
      setSyncError(null);
      setHydratedToken(null);
      return null;
    }
    setIsFetchingRides(true);
    try {
      const rides = await riderRidesApi.listRides(token, { limit: 40 });
      setSyncError(null);
      const reconciled = rides.map((r) => {
        if (recordRideVersion(r)) return r;
        return rideHistoryRef.current.find((cached) => cached.id === r.id) ?? r;
      });
      const sorted = [...reconciled].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      rideHistoryRef.current = sorted;
      setRideHistory(sorted);

      const currentActive = sorted.find((r) => isRideActive(r.status)) ?? null;
      if (currentActive) {
        // Fetch authoritative single ride (which includes rider-visible 4-digit pickupOtp) + events
        const detail = await refreshRideById(currentActive.id);
        return detail?.ride ?? currentActive;
      } else {
        activeRideIdRef.current = null;
        setActiveRide(null);
        setActiveRideEvents([]);
        setDriverLiveLocation(null);
        return null;
      }
    } catch (error: unknown) {
      handleSyncError(error);
      return null;
    } finally {
      setIsFetchingRides(false);
      setHydratedToken(token);
    }
  }, [handleSyncError, recordRideVersion, refreshRideById, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!token) {
        activeRideIdRef.current = null;
        rideHistoryRef.current = [];
        maxVersionByRideRef.current = {};
        setActiveRide(null);
        setActiveRideEvents([]);
        setRideHistory([]);
        setIsRealtimeConnected(false);
        setDriverLiveLocation(null);
        setHydratedToken(null);
        return;
      }
      void refreshRides();
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshRides, token]);

  // WebSocket connection + automatic resync
  useEffect(() => {
    if (!token) return;
    let closed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(getRealtimeWsUrl(token));
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        attempt = 0;
        setIsRealtimeConnected(true);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data)) as {
            event?: string;
            data?: Record<string, unknown>;
          };
          if (!msg.event) return;

          if (msg.event === 'connection.ready') {
            void refreshRides();
            return;
          }

          if (msg.event === 'driver.location.updated' && msg.data) {
            if (msg.data.rideId !== activeRideIdRef.current) return;
            const lat = Number(msg.data.lat);
            const lng = Number(msg.data.lng);
            if (
              Number.isFinite(lat) &&
              Number.isFinite(lng) &&
              Math.abs(lat) <= 90 &&
              Math.abs(lng) <= 180
            ) {
              setDriverLiveLocation({
                lat,
                lng,
                updatedAt: new Date().toISOString(),
              });
            }
            return;
          }

          if (msg.event.startsWith('ride.')) {
            const rideId =
              typeof msg.data?.rideId === 'string' ? msg.data.rideId : activeRideIdRef.current;
            if (rideId) {
              void refreshRideById(rideId).catch(handleSyncError);
            } else {
              void refreshRides();
            }
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        setIsRealtimeConnected(false);
      };

      ws.onclose = () => {
        setIsRealtimeConnected(false);
        if (!closed) {
          scheduleReconnect();
        }
      };
    };

    const scheduleReconnect = () => {
      if (closed) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const delay = Math.min(1000 * Math.pow(2, attempt), 12000);
      attempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, [handleSyncError, refreshRideById, refreshRides, token]);

  // Resync on app foreground resume & poll active ride periodically
  useEffect(() => {
    if (!token) return;
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void refreshRides();
      }
    });

    const intervalMs = activeRide ? (isRealtimeConnected ? 8000 : 4000) : 20000;
    const timer = setInterval(() => {
      if (activeRideIdRef.current) {
        void refreshRideById(activeRideIdRef.current).catch(handleSyncError);
      }
    }, intervalMs);

    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [activeRide, handleSyncError, isRealtimeConnected, refreshRideById, refreshRides, token]);

  const createRide = useCallback(
    async (payload: CreateRiderRidePayload): Promise<RiderRideViewDto> => {
      if (!token) throw new Error('Authentication required');
      const created = await riderRidesApi.createRide(token, payload);
      recordRideVersion(created);
      activeRideIdRef.current = created.id;
      setDriverLiveLocation(null);
      setActiveRide(created);
      setActiveRideEvents([]);
      setRideHistory((prev) => {
        const next = [created, ...prev.filter((r) => r.id !== created.id)];
        rideHistoryRef.current = next;
        return next;
      });
      return created;
    },
    [recordRideVersion, token],
  );

  const respondToCounter = useCallback(
    async (rideId: string, driverId: string, action: 'ACCEPTED' | 'REJECTED'): Promise<void> => {
      if (!token) throw new Error('Authentication required');
      await riderRidesApi.respondToCounter(token, rideId, driverId, action);
      await refreshRideById(rideId);
    },
    [refreshRideById, token],
  );

  const cancelRide = useCallback(
    async (rideId: string, reason: CancellationReason): Promise<RiderRideViewDto> => {
      if (!token) throw new Error('Authentication required');
      const cancelled = await riderRidesApi.cancelRide(token, rideId, reason);
      recordRideVersion(cancelled);
      if (activeRideIdRef.current === cancelled.id) {
        activeRideIdRef.current = null;
      }
      setActiveRide(null);
      setActiveRideEvents([]);
      setDriverLiveLocation(null);
      setRideHistory((prev) => {
        const exists = prev.some((r) => r.id === cancelled.id);
        const next = exists
          ? prev.map((r) => (r.id === cancelled.id ? cancelled : r))
          : [cancelled, ...prev];
        rideHistoryRef.current = next;
        return next;
      });
      return cancelled;
    },
    [recordRideVersion, token],
  );

  const raiseFare = useCallback(
    async (rideId: string, proposedFarePaise: number): Promise<RiderRideViewDto> => {
      if (!token) throw new Error('Authentication required');
      const updated = await riderRidesApi.raiseFare(token, rideId, proposedFarePaise);
      recordRideVersion(updated);
      await refreshRideById(rideId);
      return updated;
    },
    [recordRideVersion, refreshRideById, token],
  );

  const disputePayment = useCallback(
    async (rideId: string, reason: string): Promise<RiderRideViewDto> => {
      if (!token) throw new Error('Authentication required');
      const disputed = await riderRidesApi.disputePayment(token, rideId, reason);
      recordRideVersion(disputed);
      setRideHistory((prev) => {
        const exists = prev.some((r) => r.id === disputed.id);
        const next = exists
          ? prev.map((r) => (r.id === disputed.id ? disputed : r))
          : [disputed, ...prev];
        rideHistoryRef.current = next;
        return next;
      });
      return disputed;
    },
    [recordRideVersion, token],
  );

  const pendingCounters = useMemo(
    () => extractPendingDriverCounters(activeRideEvents),
    [activeRideEvents],
  );

  const value = useMemo<RideContextValue>(
    () => ({
      activeRide,
      activeRideEvents,
      pendingCounters,
      rideHistory,
      isLoadingRides,
      isRealtimeConnected,
      syncError,
      driverLiveLocation,
      bookingDraft,
      setBookingDraft,
      refreshRides,
      refreshRideById,
      createRide,
      respondToCounter,
      raiseFare,
      cancelRide,
      disputePayment,
    }),
    [
      activeRide,
      activeRideEvents,
      pendingCounters,
      rideHistory,
      isLoadingRides,
      isRealtimeConnected,
      syncError,
      driverLiveLocation,
      bookingDraft,
      refreshRides,
      refreshRideById,
      createRide,
      respondToCounter,
      raiseFare,
      cancelRide,
      disputePayment,
    ],
  );

  return <RideContext.Provider value={value}>{children}</RideContext.Provider>;
}

export function useRide(): RideContextValue {
  const ctx = useContext(RideContext);
  if (!ctx) throw new Error('useRide must be used within a RideProvider');
  return ctx;
}
