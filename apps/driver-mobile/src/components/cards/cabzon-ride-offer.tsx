import { type TollSnapshot, tollDisclosure } from '@cabzone/contracts';
import { locationLabel } from '@/services/location-names';

import React, { useEffect, useState } from 'react';
import { Animated, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, motion } from '@/design-system';
import { CabzonButton } from '@/components/buttons/cabzon-button';
import { RoutePointIcon } from '@/components/common/route-point-icon';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { RideOfferDto } from '@/services/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface CabzonRideOfferData {
  tollSnapshot?: TollSnapshot | null;
  rideId: string;
  farePaise: number;
  pickupAddress: string;
  dropoffAddress: string;
  stopAddresses?: string[];
  distanceKm: number;
  estimatedDurationMin?: number;
  serviceType: string;
  expiresAt?: string | null;
  floorPaise?: number;
  ceilingPaise?: number;
}

export function mapRideOfferDtoToCardData(offer: RideOfferDto): CabzonRideOfferData {
  const distanceKm = Number((offer.distanceToPickupM / 1000).toFixed(1));
  return {
    tollSnapshot: offer.tollSnapshot ?? null,
    rideId: offer.rideId,
    farePaise: offer.proposedFarePaise,
    pickupAddress: locationLabel(offer.pickup.address, 'Pickup location'),
    dropoffAddress: locationLabel(offer.drop.address, 'Destination'),
    ...(offer.stops?.length
      ? { stopAddresses: offer.stops.map((stop) => locationLabel(stop.address, 'Stop')) }
      : {}),
    distanceKm,
    serviceType: offer.vehicleCategory,
    expiresAt: offer.expiresAt,
    ...(offer.negotiation && {
      floorPaise: offer.negotiation.floorPaise,
      ceilingPaise: offer.negotiation.ceilingPaise,
    }),
  };
}

export interface CabzonRideOfferProps {
  offer: CabzonRideOfferData | null;
  onAccept: (rideId: string) => void;
  onDecline: (rideId: string) => void;
  /** Sends a counter fare (paise); resolves true when the rider was notified. */
  onCounter?: (rideId: string, farePaise: number) => Promise<boolean>;
  /** Fare (paise) this driver already countered with, awaiting the rider. */
  counteredFarePaise?: number | null;
  /** Fare (paise) the rider declined on this offer, if any. */
  rejectedFarePaise?: number | null;
  isAccepting?: boolean;
}

const COUNTER_STEP_PAISE = 1000;

export function CabzonRideOffer({
  offer,
  onAccept,
  onDecline,
  onCounter,
  counteredFarePaise = null,
  rejectedFarePaise = null,
  isAccepting = false,
}: CabzonRideOfferProps) {
  const [slideAnim] = useState(() => new Animated.Value(SCREEN_HEIGHT));
  const [opacityAnim] = useState(() => new Animated.Value(0));
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState<number | null>(null);
  const [counterFare, setCounterFare] = useState<number | null>(null);
  const [liveDot] = useState(() => new Animated.Value(1));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (offer) {
      if (reducedMotion) {
        slideAnim.setValue(0);
        opacityAnim.setValue(1);
      } else {
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: motion.duration.normal,
            easing: motion.nativeEasing.enter,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: motion.duration.normal,
            useNativeDriver: true,
          }),
        ]).start();
      }
    } else {
      slideAnim.setValue(SCREEN_HEIGHT);
      opacityAnim.setValue(0);
    }
  }, [offer, reducedMotion, slideAnim, opacityAnim]);

  useEffect(() => {
    if (!offer?.expiresAt) {
      return;
    }
    const updateRemaining = () => {
      const diffMs = new Date(offer.expiresAt!).getTime() - Date.now();
      const secs = Math.max(0, Math.ceil(diffMs / 1000));
      setSecondsLeft(secs);
      setTotalSeconds((prev) => prev ?? Math.max(secs, 1));
      if (secs <= 0 && !isAccepting) {
        onDecline(offer.rideId);
      }
    };
    const initialTimer = setTimeout(updateRemaining, 0);
    const timer = setInterval(updateRemaining, 500);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [offer?.rideId, offer?.expiresAt, isAccepting, onDecline]);

  useEffect(() => {
    if (!offer || reducedMotion) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(liveDot, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(liveDot, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [offer, reducedMotion, liveDot]);

  if (!offer) return null;

  const floorPaise = offer.floorPaise ?? 0;
  const ceilingPaise = offer.ceilingPaise ?? Number.MAX_SAFE_INTEGER;

  const displaySecondsLeft = offer.expiresAt ? secondsLeft : null;
  const grossRupees = (offer.farePaise / 100).toFixed(0);
  const netPaise = Math.round(offer.farePaise * 0.92);
  const netRupees = (netPaise / 100).toFixed(0);

  return (
    <Animated.View
      style={[
        styles.sheetContainer,
        {
          opacity: opacityAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.handle} />

      <View style={styles.liveRow}>
        <View style={styles.liveLabel}>
          <Animated.View style={[styles.liveDot, { opacity: liveDot }]} />
          <Text style={styles.liveText}>New ride request</Text>
        </View>
        {displaySecondsLeft != null ? (
          <View style={[styles.timerPill, displaySecondsLeft <= 8 && styles.timerPillUrgent]}>
            <Ionicons
              name="time-outline"
              size={13}
              color={displaySecondsLeft <= 8 ? colors.error : colors.deepBrown}
            />
            <Text style={[styles.timerText, displaySecondsLeft <= 8 && styles.timerTextUrgent]}>
              {displaySecondsLeft}s
            </Text>
          </View>
        ) : null}
      </View>

      {displaySecondsLeft != null && totalSeconds ? (
        <View style={styles.progressTrack} accessibilityElementsHidden>
          <View
            style={[
              styles.progressFill,
              displaySecondsLeft <= 8 && styles.progressFillUrgent,
              { width: `${Math.max(0, Math.min(100, (displaySecondsLeft / totalSeconds) * 100))}%` },
            ]}
          />
        </View>
      ) : null}

      <View style={styles.fareCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.serviceTag}>{offer.serviceType.toUpperCase()}</Text>
          <Text style={styles.fareText}>₹{grossRupees}</Text>
          <Text style={styles.netHintText}>
            Est. net ₹{netRupees} after 8% fee · Cash / UPI
          </Text>
        </View>
        <View style={styles.metricsBadge}>
          <Ionicons name="navigate" size={14} color={colors.brandBrown} />
          <Text style={styles.metricsText}>{offer.distanceKm} km away</Text>
        </View>
      </View>

      <View style={styles.routeContainer}>
        <View style={styles.pointRow}>
          <RoutePointIcon type="pickup" size={20} />
          <View style={styles.pointTextContainer}>
            <Text style={styles.pointLabel}>PICKUP</Text>
            <Text style={styles.pointAddress} numberOfLines={2}>
              {offer.pickupAddress}
            </Text>
          </View>
        </View>

        {(offer.stopAddresses ?? []).map((address, index) => (
          <React.Fragment key={`stop-${index}`}>
            <View style={styles.routeLine} />
            <View style={styles.pointRow}>
              <View style={styles.stopMarker} />
              <View style={styles.pointTextContainer}>
                <Text style={styles.pointLabel}>STOP {index + 1}</Text>
                <Text style={styles.pointAddress} numberOfLines={2}>
                  {address}
                </Text>
              </View>
            </View>
          </React.Fragment>
        ))}

        <View style={styles.routeLine} />

        <View style={styles.pointRow}>
          <RoutePointIcon type="drop" size={20} />
          <View style={styles.pointTextContainer}>
            <Text style={styles.pointLabel}>DESTINATION</Text>
            <Text style={styles.pointAddress} numberOfLines={2}>
              {offer.dropoffAddress}
            </Text>
          </View>
        </View>
      </View>

      <Text style={{ fontSize: 12, color: colors.secondary, paddingHorizontal: 20 }}>
        {tollDisclosure(offer.tollSnapshot)}
      </Text>
      {counteredFarePaise != null && counterFare == null ? (
        <View style={styles.counterSentPill}>
          <Text style={styles.counterSentText}>
            Counter ₹{Math.round(counteredFarePaise / 100)} sent · Waiting for passenger response...
          </Text>
        </View>
      ) : null}

      {rejectedFarePaise != null && counteredFarePaise == null && counterFare == null ? (
        <View style={styles.counterRejectedPill}>
          <Text style={styles.counterRejectedText}>
            Passenger declined ₹{Math.round(rejectedFarePaise / 100)} — accept ₹{grossRupees} or
            send another counter
          </Text>
        </View>
      ) : null}

      {counterFare != null ? (
        <View style={styles.counterWrap}>
          <View style={styles.counterBox}>
            <Pressable
              accessibilityLabel="Decrease counter fare"
              style={[
                styles.stepBtn,
                counterFare - COUNTER_STEP_PAISE < floorPaise && styles.stepBtnOff,
              ]}
              disabled={counterFare - COUNTER_STEP_PAISE < floorPaise}
              onPress={() => setCounterFare(counterFare - COUNTER_STEP_PAISE)}
            >
              <Text style={styles.stepText}>−10</Text>
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.counterFare}>₹{Math.round(counterFare / 100)}</Text>
              <Text style={styles.counterNetHint}>
                Net ₹{Math.round((counterFare * 0.92) / 100)} after 8% fee
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Increase counter fare"
              style={[
                styles.stepBtn,
                counterFare + COUNTER_STEP_PAISE > ceilingPaise && styles.stepBtnOff,
              ]}
              disabled={counterFare + COUNTER_STEP_PAISE > ceilingPaise}
              onPress={() => setCounterFare(counterFare + COUNTER_STEP_PAISE)}
            >
              <Text style={styles.stepText}>+10</Text>
            </Pressable>
          </View>
          {offer.floorPaise != null && offer.ceilingPaise != null ? (
            <Text style={styles.boundsHintText}>
              Allowed negotiation range: ₹{Math.round(offer.floorPaise / 100)} – ₹
              {Math.round(offer.ceilingPaise / 100)}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.buttonRow}>
        {counterFare != null ? (
          <>
            <CabzonButton
              title="Back"
              variant="secondary"
              onPress={() => setCounterFare(null)}
              disabled={isAccepting}
              style={styles.declineBtn}
            />
            <CabzonButton
              title={`Send Counter ₹${Math.round(counterFare / 100)}`}
              variant="primary"
              onPress={async () => {
                if (onCounter && (await onCounter(offer.rideId, counterFare))) setCounterFare(null);
              }}
              loading={isAccepting}
              style={styles.acceptBtn}
            />
          </>
        ) : (
          <>
            <CabzonButton
              title="Ignore"
              variant="secondary"
              onPress={() => onDecline(offer.rideId)}
              disabled={isAccepting}
              style={styles.declineBtn}
            />
            {onCounter ? (
              <CabzonButton
                title="Counter"
                variant="secondary"
                onPress={() =>
                  setCounterFare(
                    counteredFarePaise ??
                      Math.min(ceilingPaise, offer.farePaise + COUNTER_STEP_PAISE),
                  )
                }
                disabled={isAccepting}
                style={styles.declineBtn}
              />
            ) : null}
            <CabzonButton
              title={`Accept ₹${grossRupees}`}
              variant="primary"
              onPress={() => onAccept(offer.rideId)}
              loading={isAccepting}
              style={styles.acceptBtn}
            />
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stopMarker: { width: 20, height: 20, borderRadius: 5, backgroundColor: colors.brandBrown, transform: [{ scale: 0.6 }] },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 16,
    zIndex: 9000,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2D9CE',
    alignSelf: 'center',
    marginBottom: 14,
  },
  liveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  liveLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E' },
  liveText: { fontSize: 15, fontWeight: '800', color: colors.deepBrown },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#F1ECE6',
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: colors.amber },
  progressFillUrgent: { backgroundColor: colors.error },
  fareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#FFF7E6',
    borderWidth: 1,
    borderColor: '#FDE7B0',
    marginBottom: 14,
  },
  serviceTag: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.brandBrown,
    letterSpacing: 0.5,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1ECE6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  timerPillUrgent: {
    backgroundColor: '#FEE2E2',
  },
  timerText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  timerTextUrgent: {
    color: colors.error,
  },
  fareText: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  netHintText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondary,
    marginTop: 2,
  },
  metricsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  metricsText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  routeContainer: {
    gap: 12,
    marginBottom: 16,
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#FAF7F3',
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLine: {
    width: 2,
    height: 14,
    backgroundColor: '#E2E8F0',
    marginLeft: 4,
    marginVertical: -8,
  },
  pointTextContainer: {
    flex: 1,
  },
  pointLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondary,
  },
  pointAddress: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  counterSentPill: {
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  counterSentText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brandBrown,
    textAlign: 'center',
  },
  counterRejectedPill: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  counterRejectedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
    textAlign: 'center',
  },
  counterWrap: {
    marginBottom: 14,
    alignItems: 'center',
    gap: 6,
  },
  counterBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  counterFare: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.deepBrown,
    minWidth: 110,
    textAlign: 'center',
  },
  counterNetHint: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.secondary,
  },
  boundsHintText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.secondary,
  },
  stepBtn: {
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnOff: {
    opacity: 0.35,
  },
  stepText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  declineBtn: {
    flex: 1,
    height: 56,
    borderRadius: 18,
  },
  acceptBtn: {
    flex: 1.8,
    height: 56,
    borderRadius: 18,
  },
});
