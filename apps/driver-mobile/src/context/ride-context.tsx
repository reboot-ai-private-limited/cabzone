import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CancellationReason, RideDto, RideEventDto, RideStatus } from '@cabzone/contracts';
import { AppState, Platform, Vibration } from 'react-native';
import {
  API_BASE_URL,
  dispatchApi,
  isApiError,
  ridesApi,
  type CompleteRideResultDto,
  type RideOfferDto,
} from '@/services/api';
import {
  notifyCounterResponseLocal,
  notifyIncomingOfferLocal,
  registerForPushAsync,
  listenForPushTokenChanges,
} from '@/services/push-notifications';
import { getOrCreateDeviceId } from '@/services/storage';
import { useAuth } from './auth-context';
import { useDuty } from './duty-context';

export const ACTIVE_RIDE_STATUSES: ReadonlySet<RideStatus> = new Set([
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
]);

export const PENDING_PAYMENT_STATUSES: ReadonlySet<RideStatus> = new Set([
  'TRIP_COMPLETED',
  'PAYMENT_PENDING',
  'PAYMENT_CASH_CLAIMED',
]);

const RECOVERABLE_DRIVER_RIDE_STATUSES: RideStatus[] = [
  ...ACTIVE_RIDE_STATUSES,
  ...PENDING_PAYMENT_STATUSES,
];

const CHAT_ELIGIBLE_STATUSES = new Set<string>([
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'TRIP_STARTED',
]);

interface RideContextType {
  chatRevision: number;
  socketConnected: boolean;
  unreadChatRideId: string | null;
  clearUnreadChat: (rideId?: string) => void;
  offers: RideOfferDto[];
  activeOffer: RideOfferDto | null;
  activeRide: RideDto | null;
  pendingPaymentRide: RideDto | null;
  isCheckingActiveRide: boolean;
  isMutatingRide: boolean;
  rideError: string | null;
  clearRideError: () => void;
  refreshOffers: (forceCheck?: boolean) => Promise<void>;
  refreshActiveRide: (rideIdOverride?: string) => Promise<RideDto | null>;
  ignoreOffer: (rideId: string) => void;
  acceptOffer: (rideId: string) => Promise<RideDto | null>;
  /** Fare (paise) this driver has countered with, per ride, still awaiting the rider's answer. */
  counters: Record<string, number>;
  /** Last counter fare (paise) declined by the rider, per ride, so the driver sees feedback. */
  rejectedCounters: Record<string, number>;
  counterOffer: (rideId: string, farePaise: number) => Promise<boolean>;
  markEnRoute: (rideId: string) => Promise<RideDto | null>;
  markArrived: (rideId: string) => Promise<RideDto | null>;
  startTripWithOtp: (rideId: string, otp: string) => Promise<RideDto | null>;
  completeTrip: (rideId: string) => Promise<CompleteRideResultDto | null>;
  respondEarlyDrop: (rideId: string, decision: 'ACCEPT' | 'DECLINE') => Promise<RideDto | null>;
  confirmDirectPayment: (rideId: string) => Promise<CompleteRideResultDto | null>;
  markRideUnpaid: (rideId: string, reason?: string) => Promise<RideDto | null>;
  cancelTrip: (rideId: string, reason: CancellationReason) => Promise<RideDto | null>;
  fetchRideDetail: (rideId: string) => Promise<{ ride: RideDto; events: RideEventDto[] } | null>;
}

const RideContext = createContext<RideContextType | undefined>(undefined);
const OFFER_CHECK_ERROR = 'Unable to check ride requests';

export function isRideOfferValid(offer: RideOfferDto): boolean {
  if (!offer.expiresAt) return true;
  const expiryMs = new Date(offer.expiresAt).getTime();
  if (Number.isNaN(expiryMs)) return true;
  return expiryMs > Date.now() + 500;
}

export function RideProvider({ children }: { children: React.ReactNode }) {
  const [chatRevision, setChatRevision] = useState(0);
  const [unreadChatRideId, setUnreadChatRideId] = useState<string | null>(null);
  const clearUnreadChat = useCallback((rideId?: string) => {
    setUnreadChatRideId((prev) => (!rideId || prev === rideId ? null : prev));
  }, []);
  const {
    token,
    user,
    driver,
    isAuthenticated,
    isKycVerified,
    canAccessDriverShell: authShellAccess,
    refreshProfile,
  } = useAuth();
  const canAccessDriverShell = authShellAccess ?? isKycVerified;
  const { status: dutyStatus, refreshSummary } = useDuty();

  const [offers, setOffers] = useState<RideOfferDto[]>([]);
  const [ignoredOfferIds, setIgnoredOfferIds] = useState<Set<string>>(() => new Set());
  const [activeRide, setActiveRide] = useState<RideDto | null>(null);
  const [pendingPaymentRide, setPendingPaymentRide] = useState<RideDto | null>(null);
  const [isCheckingActiveRide, setIsCheckingActiveRide] = useState<boolean>(false);
  const [isMutatingRide, setIsMutatingRide] = useState<boolean>(false);
  const [rideError, setRideError] = useState<string | null>(null);
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [rejectedCounters, setRejectedCounters] = useState<Record<string, number>>({});
  const [socketConnected, setSocketConnected] = useState(false);
  const [appActive, setAppActive] = useState(
    () => (AppState.currentState ?? 'active') === 'active',
  );

  const pollOffersIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollActiveRideIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightOffersRef = useRef<boolean>(false);
  const queuedOffersRefreshRef = useRef<'none' | 'normal' | 'force'>('none');
  const eligibleTokenRef = useRef<string | null>(null);
  const lastUserIdRef = useRef<string | null>(null);
  const seenOfferIdsRef = useRef<Set<string>>(new Set());
  const mutatingRideRef = useRef<boolean>(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => sub.remove();
  }, []);

  // Register this device for push so offers reach the driver while the app is backgrounded.
  useEffect(() => {
    if (!isAuthenticated || !token || !canAccessDriverShell) return;
    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    void getOrCreateDeviceId().then(async (installationId) => {
      if (cancelled) return;
      const meta = {
        platform: Platform.OS === 'ios' ? ('ios' as const) : ('android' as const),
        transport: Platform.OS === 'ios' ? ('EXPO' as const) : ('FCM' as const),
      };
      subscription = listenForPushTokenChanges((pushToken) => {
        void dispatchApi.registerPushToken(token, pushToken, installationId, meta).catch((error: unknown) => {
          console.warn('Push token update failed:', error);
        });
      });
      const pushToken = await registerForPushAsync();
      if (pushToken && !cancelled) {
        await dispatchApi
          .registerPushToken(token, pushToken, installationId, meta)
          .catch((error: unknown) => {
            console.warn('Push registration failed:', error);
          });
      }
    });
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [isAuthenticated, token, canAccessDriverShell]);

  // Reset state when user logs out or switches identity
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (!isAuthenticated || (lastUserIdRef.current && lastUserIdRef.current !== currentUserId)) {
      setOffers([]);
      setIgnoredOfferIds(new Set());
      setCounters({});
      setRejectedCounters({});
      seenOfferIdsRef.current.clear();
      queuedOffersRefreshRef.current = 'none';
      eligibleTokenRef.current = null;
      setActiveRide(null);
      setPendingPaymentRide(null);
      setUnreadChatRideId(null);
      setIsCheckingActiveRide(false);
      mutatingRideRef.current = false;
      setIsMutatingRide(false);
      setRideError(null);
    }
    lastUserIdRef.current = currentUserId;
  }, [isAuthenticated, user?.id]);

  // Recover any active ride on bootstrap or when authenticated
  const refreshActiveRide = useCallback(
    async (rideIdOverride?: string): Promise<RideDto | null> => {
      if (!token || !isAuthenticated) return null;

      try {
        if (rideIdOverride) {
          const ride = await ridesApi.getRide(token, rideIdOverride);
          if (ACTIVE_RIDE_STATUSES.has(ride.status)) {
            setActiveRide(ride);
          } else {
            setActiveRide((prev) => (prev?.id === ride.id ? null : prev));
          }
          if (PENDING_PAYMENT_STATUSES.has(ride.status)) {
            setPendingPaymentRide(ride);
          } else {
            setPendingPaymentRide((prev) => (prev?.id === ride.id ? null : prev));
          }
          return ride;
        }

        const list = await ridesApi.listMyRides(token, {
          status: RECOVERABLE_DRIVER_RIDE_STATUSES,
          limit: 10,
        });
        const found = list.find((r) => ACTIVE_RIDE_STATUSES.has(r.status)) ?? null;
        const foundPending = list.find((r) => PENDING_PAYMENT_STATUSES.has(r.status)) ?? null;
        setActiveRide(found);
        setPendingPaymentRide(foundPending);
        return found;
      } catch {
        return null;
      }
    },
    [token, isAuthenticated],
  );

  useEffect(() => {
    if (!isAuthenticated || !token || !canAccessDriverShell) {
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsCheckingActiveRide(true);
    ridesApi
      .listMyRides(token, { status: RECOVERABLE_DRIVER_RIDE_STATUSES, limit: 10 })
      .then((list) => {
        if (cancelled) return;
        const found = list.find((r) => ACTIVE_RIDE_STATUSES.has(r.status)) ?? null;
        const foundPending = list.find((r) => PENDING_PAYMENT_STATUSES.has(r.status)) ?? null;
        setActiveRide(found);
        setPendingPaymentRide(foundPending);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setIsCheckingActiveRide(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, token, canAccessDriverShell]);

  const refreshOffers = useCallback(
    async (forceCheck = false) => {
      if (!token || dutyStatus !== 'ONLINE' || activeRide) {
        return;
      }
      if (inFlightOffersRef.current) {
        if (forceCheck || queuedOffersRefreshRef.current === 'none') {
          queuedOffersRefreshRef.current = forceCheck ? 'force' : 'normal';
        }
        return;
      }
      if (forceCheck) {
        setIgnoredOfferIds(new Set());
      }
      inFlightOffersRef.current = true;
      try {
        const rawOffers = await dispatchApi.listOffers(token);
        const seenRideIds = new Set<string>();
        const valid = rawOffers.filter((offer) => {
          if (!isRideOfferValid(offer) || seenRideIds.has(offer.rideId)) return false;
          seenRideIds.add(offer.rideId);
          return true;
        });
        setRideError((previous) => previous?.startsWith(OFFER_CHECK_ERROR) ? null : previous);

        // Alert driver with sound/vibration/banner when a brand-new offer arrives
        for (const offer of valid) {
          if (!seenOfferIdsRef.current.has(offer.rideId)) {
            seenOfferIdsRef.current.add(offer.rideId);
            if (Platform.OS !== 'web') {
              Vibration.vibrate([0, 220, 120, 220]);
            }
            void notifyIncomingOfferLocal(offer);
          }
        }

        setOffers(valid);
        const counterIds = Object.keys(counters);
        if (counterIds.length > 0) {
          const open = new Set(valid.map((o) => o.rideId));
          // Check if any open countered ride was rejected by the customer
          for (const rideId of counterIds) {
            if (open.has(rideId)) {
              const events = await ridesApi
                .getRideEvents(token, rideId)
                .catch(() => [] as RideEventDto[]);
              const lastNegotiationEvent = [...events]
                .reverse()
                .find(
                  (e) =>
                    e.eventType === 'FARE_PROPOSAL_RAISED' ||
                    ((e.eventType === 'FARE_COUNTER_PROPOSED' ||
                      e.eventType === 'FARE_COUNTERED' ||
                      e.eventType === 'FARE_COUNTER_REJECTED') &&
                      (!driver?.id ||
                        (e.metadata as { driverId?: string } | null)?.driverId === driver.id)),
                );
              if (lastNegotiationEvent?.eventType === 'FARE_PROPOSAL_RAISED') {
                setCounters((prev) => {
                  const next = { ...prev };
                  delete next[rideId];
                  return next;
                });
                setRejectedCounters((prev) => {
                  const next = { ...prev };
                  delete next[rideId];
                  return next;
                });
              } else if (lastNegotiationEvent?.eventType === 'FARE_COUNTER_REJECTED') {
                const lastDriverEvent = lastNegotiationEvent;
                const declinedFare =
                  (lastDriverEvent.metadata as { proposedFarePaise?: number } | null)
                    ?.proposedFarePaise ?? counters[rideId]!;
                setCounters((prev) => {
                  const next = { ...prev };
                  delete next[rideId];
                  return next;
                });
                setRejectedCounters((prev) => ({ ...prev, [rideId]: declinedFare }));
                void notifyCounterResponseLocal(rideId, false, declinedFare);
              }
            }
          }
          setCounters((prev) => {
            const entries = Object.entries(prev);
            const kept = entries.filter(([id]) => open.has(id));
            return kept.length === entries.length ? prev : Object.fromEntries(kept);
          });
          // The rider taking our counter assigns us the ride: it then shows up as an active ride.
          const assigned = await refreshActiveRide();
          if (assigned && counters[assigned.id]) {
            void notifyCounterResponseLocal(assigned.id, true, counters[assigned.id]!);
          }
        }
      } catch (err: unknown) {
        setRideError(`${OFFER_CHECK_ERROR}: ${err instanceof Error ? err.message : 'Check your connection and try again.'}`);
      } finally {
        inFlightOffersRef.current = false;
        const nextRefresh = queuedOffersRefreshRef.current;
        queuedOffersRefreshRef.current = 'none';
        if (nextRefresh !== 'none') {
          void refreshRef.current.offers(nextRefresh === 'force');
        }
      }
    },
    [token, dutyStatus, activeRide, counters, driver, refreshActiveRide],
  );

  const refreshRef = useRef({
    offers: refreshOffers,
    activeRide: refreshActiveRide,
    summary: refreshSummary,
  });
  useEffect(() => {
    refreshRef.current = {
      offers: refreshOffers,
      activeRide: refreshActiveRide,
      summary: refreshSummary,
    };
  }, [refreshOffers, refreshActiveRide, refreshSummary]);

  useEffect(() => {
    const nextExpiryMs = offers.reduce<number | null>((earliest, offer) => {
      if (!offer.expiresAt) return earliest;
      const ms = new Date(offer.expiresAt).getTime();
      if (Number.isNaN(ms)) return earliest;
      return earliest === null || ms < earliest ? ms : earliest;
    }, null);
    if (nextExpiryMs === null) return;
    const timer = setTimeout(() => {
      setOffers((prev) => prev.filter(isRideOfferValid));
    }, Math.max(0, nextExpiryMs - Date.now()));
    return () => clearTimeout(timer);
  }, [offers]);

  const hasActiveRide = Boolean(activeRide);

  // REST polling remains a recovery path for missed events and disconnected sockets.
  useEffect(() => {
    if (pollOffersIntervalRef.current) {
      clearInterval(pollOffersIntervalRef.current);
      pollOffersIntervalRef.current = null;
    }

    const eligibleToken =
      token && dutyStatus === 'ONLINE' && !hasActiveRide && appActive ? token : null;
    if (!eligibleToken) {
      eligibleTokenRef.current = null;
      return;
    }

    const becameEligible = eligibleTokenRef.current !== eligibleToken;
    eligibleTokenRef.current = eligibleToken;

    if (socketConnected) {
      if (becameEligible) {
        void refreshRef.current.offers();
      }
      return;
    }

    void refreshRef.current.offers();
    pollOffersIntervalRef.current = setInterval(() => {
      void refreshRef.current.offers();
    }, 3000);

    return () => {
      if (pollOffersIntervalRef.current) {
        clearInterval(pollOffersIntervalRef.current);
        pollOffersIntervalRef.current = null;
      }
    };
  }, [token, dutyStatus, hasActiveRide, socketConnected, appActive]);

  // Poll active ride status every 4 seconds while an active ride exists (to detect rider cancellation or dispute)
  useEffect(() => {
    if (pollActiveRideIntervalRef.current) {
      clearInterval(pollActiveRideIntervalRef.current);
      pollActiveRideIntervalRef.current = null;
    }

    if (!token || !activeRide?.id) {
      return;
    }

    pollActiveRideIntervalRef.current = setInterval(async () => {
      try {
        const fresh = await ridesApi.getRide(token, activeRide.id);
        if (ACTIVE_RIDE_STATUSES.has(fresh.status)) {
          setActiveRide(fresh);
        } else {
          setActiveRide(null);
          if (PENDING_PAYMENT_STATUSES.has(fresh.status)) {
            setPendingPaymentRide(fresh);
          }
          void refreshSummary();
        }
      } catch {
        // ignore transient poll error
      }
    }, 4000);

    return () => {
      if (pollActiveRideIntervalRef.current) {
        clearInterval(pollActiveRideIntervalRef.current);
        pollActiveRideIntervalRef.current = null;
      }
    };
  }, [token, activeRide?.id, refreshSummary]);

  useEffect(() => {
    if (!token || !isAuthenticated || !canAccessDriverShell) return;
    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;

    const resync = () => {
      void refreshRef.current.activeRide();
      void refreshRef.current.offers();
    };

    const connect = () => {
      if (stopped || AppState.currentState !== 'active') return;
      const url = new URL(API_BASE_URL);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = '/ws';
      url.searchParams.set('access_token', token);
      socket = new WebSocket(url.toString());
      socket.onmessage = (message) => {
        try {
          const frame = JSON.parse(String(message.data)) as {
            event?: string;
            data?: {
              rideId?: string;
              proposedFarePaise?: number;
              viaCounter?: boolean;
              senderRole?: string;
            };
          };
          if (frame.event === 'connection.ready') {
            setChatRevision((n) => n + 1);
            retries = 0;
            setSocketConnected(true);
            resync();
          } else if (frame.event === 'ride.chat.message') {
            setChatRevision((n) => n + 1);
            if (frame.data?.senderRole === 'RIDER' && typeof frame.data?.rideId === 'string') {
              setUnreadChatRideId(frame.data.rideId);
            }
          } else if (frame.event === 'driver.kyc.expiring' || frame.event === 'driver.kyc.expired') {
            void refreshProfile();
          } else if (frame.event === 'ride.offer.created') {
            void refreshRef.current.offers();
          } else if (frame.event === 'ride.fare.raised') {
            const rideId = frame.data?.rideId;
            if (rideId) {
              setIgnoredOfferIds((prev) => {
                if (!prev.has(rideId)) return prev;
                const next = new Set(prev);
                next.delete(rideId);
                return next;
              });
              setCounters((prev) => {
                if (!(rideId in prev)) return prev;
                const next = { ...prev };
                delete next[rideId];
                return next;
              });
              setRejectedCounters((prev) => {
                if (!(rideId in prev)) return prev;
                const next = { ...prev };
                delete next[rideId];
                return next;
              });
            }
            void refreshRef.current.offers(true);
          } else if (frame.event === 'ride.fare.counter_rejected') {
            const rideId = frame.data?.rideId;
            const declinedFare = frame.data?.proposedFarePaise;
            if (rideId) {
              setCounters((prev) => {
                const next = { ...prev };
                delete next[rideId];
                return next;
              });
              if (declinedFare) {
                setRejectedCounters((prev) => ({ ...prev, [rideId]: declinedFare }));
                void notifyCounterResponseLocal(rideId, false, declinedFare);
              }
            }
          } else if (
            frame.event === 'ride.offer.taken' ||
            frame.event === 'ride.offer.expired' ||
            frame.event === 'ride.cancelled'
          ) {
            const rideId = frame.data?.rideId;
            if (rideId) setOffers((previous) => previous.filter((offer) => offer.rideId !== rideId));
            resync();
            if (frame.event === 'ride.cancelled') {
              setChatRevision((n) => n + 1);
              setUnreadChatRideId((prev) => (!rideId || prev === rideId ? null : prev));
              void refreshRef.current.summary();
            }
          } else if (frame.event?.startsWith('ride.')) {
            setChatRevision((n) => n + 1);
            resync();
            if (
              frame.event === 'ride.completed' ||
              frame.event === 'ride.settled' ||
              frame.event.includes('payment') ||
              frame.event.includes('dispute')
            ) {
              void refreshRef.current.summary();
            }
          }
        } catch {
          // A malformed or unknown frame cannot change authoritative ride state.
        }
      };
      socket.onclose = () => {
        setSocketConnected(false);
        if (!stopped && AppState.currentState === 'active') {
          reconnectTimer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(retries++, 5)));
        }
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        socket?.close();
      } else {
        resync();
        if (!socket || socket.readyState === WebSocket.CLOSED) connect();
      }
    });
    return () => {
      stopped = true;
      setSocketConnected(false);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      appState.remove();
      socket?.close();
    };
  }, [token, isAuthenticated, canAccessDriverShell, refreshProfile]);

  const ignoreOffer = useCallback((rideId: string) => {
    setIgnoredOfferIds((prev) => {
      const next = new Set(prev);
      next.add(rideId);
      return next;
    });
    setOffers((prev) => prev.filter((o) => o.rideId !== rideId));
  }, []);

  const activeOffer = useMemo(() => {
    if (dutyStatus !== 'ONLINE' || activeRide) return null;
    const valid = offers.filter((o) => !ignoredOfferIds.has(o.rideId) && isRideOfferValid(o));
    return valid[0] ?? null;
  }, [dutyStatus, activeRide, offers, ignoredOfferIds]);

  const acceptOffer = useCallback(
    async (rideId: string): Promise<RideDto | null> => {
      if (!token || isMutatingRide || mutatingRideRef.current) return null;
      mutatingRideRef.current = true;
      setIsMutatingRide(true);
      setRideError(null);
      try {
        const accepted = await ridesApi.acceptRide(token, rideId);
        setActiveRide(accepted);
        setOffers([]);
        void refreshSummary();
        return accepted;
      } catch (err: unknown) {
        ignoreOffer(rideId);
        if (isApiError(err) && (err.status === 409 || err.status === 410 || err.status === 400)) {
          setRideError('Ride already taken or expired. Searching for the next available ride...');
        } else {
          setRideError(err instanceof Error ? err.message : 'Unable to accept ride offer');
        }
        return null;
      } finally {
        mutatingRideRef.current = false;
      setIsMutatingRide(false);
      }
    },
    [token, isMutatingRide, ignoreOffer, refreshSummary],
  );

  const counterOffer = useCallback(
    async (rideId: string, farePaise: number): Promise<boolean> => {
      if (!token || isMutatingRide || mutatingRideRef.current) return false;
      mutatingRideRef.current = true;
      setIsMutatingRide(true);
      setRideError(null);
      try {
        const sent = await ridesApi.counterOffer(token, rideId, farePaise);
        setCounters((prev) => ({ ...prev, [rideId]: sent.proposedFarePaise }));
        setRejectedCounters((prev) => {
          const next = { ...prev };
          delete next[rideId];
          return next;
        });
        return true;
      } catch (err: unknown) {
        setRideError(err instanceof Error ? err.message : 'Unable to send counter-offer');
        return false;
      } finally {
        mutatingRideRef.current = false;
      setIsMutatingRide(false);
      }
    },
    [token, isMutatingRide],
  );

  const markEnRoute = useCallback(
    async (rideId: string): Promise<RideDto | null> => {
      if (!token || isMutatingRide || mutatingRideRef.current) return null;
      mutatingRideRef.current = true;
      setIsMutatingRide(true);
      setRideError(null);
      try {
        const updated = await ridesApi.markEnRoute(token, rideId);
        setActiveRide(updated);
        return updated;
      } catch (err: unknown) {
        setRideError(err instanceof Error ? err.message : 'Failed to update status to En Route');
        return null;
      } finally {
        mutatingRideRef.current = false;
      setIsMutatingRide(false);
      }
    },
    [token, isMutatingRide],
  );

  const markArrived = useCallback(
    async (rideId: string): Promise<RideDto | null> => {
      if (!token || isMutatingRide || mutatingRideRef.current) return null;
      mutatingRideRef.current = true;
      setIsMutatingRide(true);
      setRideError(null);
      try {
        const updated = await ridesApi.markArrived(token, rideId);
        setActiveRide(updated);
        return updated;
      } catch (err: unknown) {
        setRideError(err instanceof Error ? err.message : 'Failed to mark arrival at pickup');
        return null;
      } finally {
        mutatingRideRef.current = false;
      setIsMutatingRide(false);
      }
    },
    [token, isMutatingRide],
  );

  const startTripWithOtp = useCallback(
    async (rideId: string, otp: string): Promise<RideDto | null> => {
      if (!token || isMutatingRide || mutatingRideRef.current) return null;
      const cleaned = otp.replace(/\D/g, '');
      if (cleaned.length !== 4) {
        setRideError('Please enter the 4-digit pickup OTP from the passenger.');
        return null;
      }
      mutatingRideRef.current = true;
      setIsMutatingRide(true);
      setRideError(null);
      try {
        const updated = await ridesApi.startRide(token, rideId, cleaned);
        setActiveRide(updated);
        return updated;
      } catch (err: unknown) {
        setRideError(
          err instanceof Error ? err.message : 'Invalid pickup OTP. Please ask the passenger again.',
        );
        return null;
      } finally {
        mutatingRideRef.current = false;
      setIsMutatingRide(false);
      }
    },
    [token, isMutatingRide],
  );

  const completeTrip = useCallback(
    async (rideId: string): Promise<CompleteRideResultDto | null> => {
      if (!token || isMutatingRide || mutatingRideRef.current) return null;
      mutatingRideRef.current = true;
      setIsMutatingRide(true);
      setRideError(null);
      try {
        const res = await ridesApi.completeRide(token, rideId);
        setActiveRide(ACTIVE_RIDE_STATUSES.has(res.ride.status) ? res.ride : null);
        if (PENDING_PAYMENT_STATUSES.has(res.ride.status)) {
          setPendingPaymentRide(res.ride);
        }
        void refreshSummary();
        return res;
      } catch (err: unknown) {
        setRideError(err instanceof Error ? err.message : 'Failed to complete trip');
        return null;
      } finally {
        mutatingRideRef.current = false;
      setIsMutatingRide(false);
      }
    },
    [token, isMutatingRide, refreshSummary],
  );

  const respondEarlyDrop = useCallback(
    async (rideId: string, decision: 'ACCEPT' | 'DECLINE'): Promise<RideDto | null> => {
      if (!token || isMutatingRide || mutatingRideRef.current) return null;
      mutatingRideRef.current = true;
      setIsMutatingRide(true);
      setRideError(null);
      try {
        const updated = await ridesApi.respondEarlyDrop(token, rideId, decision);
        setActiveRide(ACTIVE_RIDE_STATUSES.has(updated.status) ? updated : null);
        if (PENDING_PAYMENT_STATUSES.has(updated.status)) {
          setPendingPaymentRide(updated);
        }
        if (decision === 'ACCEPT') void refreshSummary();
        return updated;
      } catch (err: unknown) {
        setRideError(err instanceof Error ? err.message : 'Failed to answer the early drop request');
        return null;
      } finally {
        mutatingRideRef.current = false;
        setIsMutatingRide(false);
      }
    },
    [token, isMutatingRide, refreshSummary],
  );

  const confirmDirectPayment = useCallback(
    async (rideId: string): Promise<CompleteRideResultDto | null> => {
      if (!token || isMutatingRide || mutatingRideRef.current) return null;
      mutatingRideRef.current = true;
      setIsMutatingRide(true);
      setRideError(null);
      try {
        const res = await ridesApi.confirmPayment(token, rideId);
        if (ACTIVE_RIDE_STATUSES.has(res.ride.status)) {
          setActiveRide(res.ride);
        } else {
          setActiveRide((prev) => (prev?.id === res.ride.id ? null : prev));
        }
        if (PENDING_PAYMENT_STATUSES.has(res.ride.status)) {
          setPendingPaymentRide(res.ride);
        } else {
          setPendingPaymentRide((prev) => (prev?.id === res.ride.id ? null : prev));
        }
        await refreshSummary();
        return res;
      } catch (err: unknown) {
        setRideError(err instanceof Error ? err.message : 'Failed to confirm payment receipt');
        return null;
      } finally {
        mutatingRideRef.current = false;
        setIsMutatingRide(false);
      }
    },
    [token, isMutatingRide, refreshSummary],
  );

  const markRideUnpaid = useCallback(
    async (rideId: string, reason?: string): Promise<RideDto | null> => {
      if (!token || isMutatingRide || mutatingRideRef.current) return null;
      mutatingRideRef.current = true;
      setIsMutatingRide(true);
      setRideError(null);
      try {
        const updated = await ridesApi.markRideUnpaid(token, rideId, reason);
        setActiveRide((prev) => (prev?.id === updated.id ? null : prev));
        setPendingPaymentRide((prev) => (prev?.id === updated.id ? null : prev));
        await refreshSummary();
        return updated;
      } catch (err: unknown) {
        setRideError(err instanceof Error ? err.message : 'Failed to report unpaid ride');
        return null;
      } finally {
        mutatingRideRef.current = false;
        setIsMutatingRide(false);
      }
    },
    [token, isMutatingRide, refreshSummary],
  );

  const cancelTrip = useCallback(
    async (rideId: string, reason: CancellationReason): Promise<RideDto | null> => {
      if (!token || isMutatingRide || mutatingRideRef.current) return null;
      mutatingRideRef.current = true;
      setIsMutatingRide(true);
      setRideError(null);
      try {
        const res = await ridesApi.cancelRide(token, rideId, reason);
        setActiveRide(null);
        setUnreadChatRideId(null);
        await refreshSummary();
        return res.ride;
      } catch (err: unknown) {
        setRideError(err instanceof Error ? err.message : 'Failed to cancel ride');
        return null;
      } finally {
        mutatingRideRef.current = false;
      setIsMutatingRide(false);
      }
    },
    [token, isMutatingRide, refreshSummary],
  );

  const fetchRideDetail = useCallback(
    async (rideId: string): Promise<{ ride: RideDto; events: RideEventDto[] } | null> => {
      if (!token) return null;
      try {
        const [ride, events] = await Promise.all([
          ridesApi.getRide(token, rideId),
          ridesApi.getRideEvents(token, rideId).catch(() => [] as RideEventDto[]),
        ]);
        return { ride, events };
      } catch (err: unknown) {
        setRideError(err instanceof Error ? err.message : 'Failed to load ride details');
        return null;
      }
    },
    [token],
  );

  const visibleUnreadChatRideId =
    token &&
    activeRide &&
    CHAT_ELIGIBLE_STATUSES.has(activeRide.status) &&
    unreadChatRideId === activeRide.id
      ? unreadChatRideId
      : null;

  return (
    <RideContext.Provider
      value={{
        chatRevision,
        socketConnected,
        unreadChatRideId: visibleUnreadChatRideId,
        clearUnreadChat,
        offers,
        activeOffer,
        activeRide,
        pendingPaymentRide,
        isCheckingActiveRide,
        isMutatingRide,
        rideError,
        clearRideError: () => setRideError(null),
        refreshOffers,
        refreshActiveRide,
        ignoreOffer,
        acceptOffer,
        counters,
        rejectedCounters,
        counterOffer,
        markEnRoute,
        markArrived,
        startTripWithOtp,
        completeTrip,
        respondEarlyDrop,
        confirmDirectPayment,
        markRideUnpaid,
        cancelTrip,
        fetchRideDetail,
      }}>
      {children}
    </RideContext.Provider>
  );
}

export function useRide() {
  const context = useContext(RideContext);
  if (!context) {
    throw new Error('useRide must be used within a RideProvider');
  }
  return context;
}
