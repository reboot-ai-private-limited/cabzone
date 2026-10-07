import React, { useEffect, useState } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, motion } from '@/design-system';
import { CabzonButton } from '@/components/buttons/cabzon-button';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface CabzonRideOfferData {
  rideId: string;
  farePaise: number;
  pickupAddress: string;
  dropoffAddress: string;
  distanceKm: number;
  estimatedDurationMin: number;
  serviceType: string;
  expiresInSeconds?: number;
}

export interface CabzonRideOfferProps {
  offer: CabzonRideOfferData | null;
  onAccept: (rideId: string) => void;
  onDecline: (rideId: string) => void;
  isAccepting?: boolean;
}

export function CabzonRideOffer({
  offer,
  onAccept,
  onDecline,
  isAccepting = false,
}: CabzonRideOfferProps) {
  const [slideAnim] = useState(() => new Animated.Value(SCREEN_HEIGHT));
  const [opacityAnim] = useState(() => new Animated.Value(0));
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

  if (!offer) return null;

  const fareRupees = (offer.farePaise / 100).toFixed(0);

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

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.serviceTag}>{offer.serviceType.toUpperCase()}</Text>
          <Text style={styles.fareText}>₹{fareRupees}</Text>
        </View>
        <View style={styles.metricsBadge}>
          <Text style={styles.metricsText}>
            {offer.distanceKm} km · {offer.estimatedDurationMin} mins
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.routeContainer}>
        <View style={styles.pointRow}>
          <View style={[styles.dot, { backgroundColor: colors.success }]} />
          <View style={styles.pointTextContainer}>
            <Text style={styles.pointLabel}>PICKUP</Text>
            <Text style={styles.pointAddress} numberOfLines={1}>
              {offer.pickupAddress}
            </Text>
          </View>
        </View>

        <View style={styles.routeLine} />

        <View style={styles.pointRow}>
          <View style={[styles.dot, { backgroundColor: colors.error }]} />
          <View style={styles.pointTextContainer}>
            <Text style={styles.pointLabel}>DESTINATION</Text>
            <Text style={styles.pointAddress} numberOfLines={1}>
              {offer.dropoffAddress}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.buttonRow}>
        <CabzonButton
          title="Decline"
          variant="secondary"
          onPress={() => onDecline(offer.rideId)}
          disabled={isAccepting}
          style={styles.declineBtn}
        />
        <CabzonButton
          title="Accept Ride"
          variant="primary"
          onPress={() => onAccept(offer.rideId)}
          loading={isAccepting}
          style={styles.acceptBtn}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 9000,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceTag: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.cabzonBlue,
    letterSpacing: 0.5,
  },
  fareText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.darkNavy,
  },
  metricsBadge: {
    backgroundColor: colors.softBlue,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.lightBlue,
  },
  metricsText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.cabzonBlue,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  routeContainer: {
    gap: 12,
    marginBottom: 20,
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
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  declineBtn: {
    flex: 1,
    height: 48,
  },
  acceptBtn: {
    flex: 2,
    height: 48,
  },
});
