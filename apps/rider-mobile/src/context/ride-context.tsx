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
  extractActiveRideConflictId,
  extractPendingDriverCounters,
  isRideActive,
  type PendingDriverCounter,
} from '@/services/rider-helpers';
import { useAuth } from './auth-context';

const RIDER_HISTORY_PAGE_SIZE = 40;

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
  hasMoreRides: boolean;
  isLoadingRides: boolean;
  isLoadingMoreRides: boolean;
  isRealtimeConnected: boolean;
  syncError: string | null;
  driverLiveLocation: { lat: number; lng: number; updatedAt: string } | null;
  bookingDraft: BookingDraft | null;
  setBookingDraft: (draft: BookingDraft | null) => void;
  refreshRides: () => Promise<RiderRideViewDto | null>;
  loadOlderRides: () => Promise<void>;
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
  const [isLoadingRides, setIsLoadingRides] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [driverLiveLocation, setDriverLiveLocation] = useState<{
    lat: number;
    lng: number;
    updatedAt: string;
  } | null>(null);
  const [bookingDraft, setBookingDraft] = useState<BookingDraft | null>(null);
  const [hasMoreRides, setHasMoreRides] = useState(false);
  const [isLoadingMoreRides, setIsLoadingMoreRides] = useState(false);

  const activeRideIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeRideIdRef.current = activeRide?.id ?? null;
  }, [activeRide?.id]);

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
        if (!exists) return [ride, ...prev];
        return prev.map((r) => (r.id === ride.id ? ride : r));
      });
      return { ride, events };
    },
    [token],
  );

  const refreshRides = useCallback(async (): Promise<RiderRideViewDto | null> => {
    if (!token) {
      setActiveRide(null);
      setActiveRideEvents([]);
      setRideHistory([]);
      setHasMoreRides(false);
      setSyncError(null);
      return null;
    }
    setIsLoadingRides(true);
    try {
      const rides = await riderRidesApi.listRides(token, { limit: RIDER_HISTORY_PAGE_SIZE });
      setSyncError(null);
      setHasMoreRides(rides.length >= RIDER_HISTORY_PAGE_SIZE);
      const seen = new Set<string>();
      const deduped = rides.filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
      const sorted = [...deduped].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setRideHistory(sorted);

      const currentActive = sorted.find((r) => isRideActive(r.status)) ?? null;
      if (currentActive) {
        // Fetch authoritative single ride (which includes rider-visible 4-digit pickupOtp) + events
        const detail = await refreshRideById(currentActive.id);
        return detail?.ride ?? currentActive;
      } else {
        setActiveRide(null);
        setActiveRideEvents([]);
        setDriverLiveLocation(null);
        return null;
      }
    } catch (error: unknown) {
      handleSyncError(error);
      return null;
    } finally {
      setIsLoadingRides(false);
    }
  }, [handleSyncError, refreshRideById, token]);

  const loadOlderRides = useCallback(async (): Promise<void> => {
    if (!token || isLoadingMoreRides || !hasMoreRides) return;
    setIsLoadingMoreRides(true);
    try {
      const older = await riderRidesApi.listRides(token, {
        limit: RIDER_HISTORY_PAGE_SIZE,
        offset: rideHistory.length,
      });
      setSyncError(null);
      setHasMoreRides(older.length >= RIDER_HISTORY_PAGE_SIZE);
      setRideHistory((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const merged = [...prev];
        for (const item of older) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }
        return merged.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      });
    } catch (error: unknown) {
      handleSyncError(error);
    } finally {
      setIsLoadingMoreRides(false);
    }
  }, [handleSyncError, hasMoreRides, isLoadingMoreRides, rideHistory.length, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!token) {
        setActiveRide(null);
        setActiveRideEvents([]);
        setRideHistory([]);
        setHasMoreRides(false);
        setIsRealtimeConnected(false);
        setDriverLiveLocation(null);
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
      let created: RiderRideViewDto;
      try {
        created = await riderRidesApi.createRide(token, payload);
      } catch (error: unknown) {
        const conflictRideId = extractActiveRideConflictId(error);
        if (conflictRideId) {
          await refreshRideById(conflictRideId).catch(handleSyncError);
        }
        throw error;
      }
      setDriverLiveLocation(null);
      activeRideIdRef.current = created.id;
      setActiveRide(created);
      setActiveRideEvents([]);
      setRideHistory((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
      return created;
    },
    [handleSyncError, refreshRideById, token],
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
      activeRideIdRef.current = null;
      setActiveRide(null);
      setActiveRideEvents([]);
      setDriverLiveLocation(null);
      setRideHistory((prev) => prev.map((r) => (r.id === cancelled.id ? cancelled : r)));
      return cancelled;
    },
    [token],
  );

  const raiseFare = useCallback(
    async (rideId: string, proposedFarePaise: number): Promise<RiderRideViewDto> => {
      if (!token) throw new Error('Authentication required');
      const updated = await riderRidesApi.raiseFare(token, rideId, proposedFarePaise);
      await refreshRideById(rideId);
      return updated;
    },
    [refreshRideById, token],
  );

  const disputePayment = useCallback(
    async (rideId: string, reason: string): Promise<RiderRideViewDto> => {
      if (!token) throw new Error('Authentication required');
      const disputed = await riderRidesApi.disputePayment(token, rideId, reason);
      if (
        (activeRideIdRef.current === disputed.id || activeRide?.id === disputed.id) &&
        !isRideActive(disputed.status)
      ) {
        activeRideIdRef.current = null;
        setActiveRide(null);
        setActiveRideEvents([]);
        setDriverLiveLocation(null);
      }
      setRideHistory((prev) => prev.map((r) => (r.id === disputed.id ? disputed : r)));
      return disputed;
    },
    [activeRide?.id, token],
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
      hasMoreRides,
      isLoadingRides,
      isLoadingMoreRides,
      isRealtimeConnected,
      syncError,
      driverLiveLocation,
      bookingDraft,
      setBookingDraft,
      refreshRides,
      loadOlderRides,
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
      hasMoreRides,
      isLoadingRides,
      isLoadingMoreRides,
      isRealtimeConnected,
      syncError,
      driverLiveLocation,
      bookingDraft,
      refreshRides,
      loadOlderRides,
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
