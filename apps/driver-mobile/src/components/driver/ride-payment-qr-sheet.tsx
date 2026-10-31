import type { QrPaymentClientState, RideDto, RidePaymentQrViewDto } from '@cabzone/contracts';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '@/context/auth-context';
import { colors } from '@/design-system';
import { ridesApi } from '@/services/api';

/** Razorpay's hosted QR image is a tall poster (~674x1644), NOT a square. */
export const RAZORPAY_POSTER_INITIAL_RATIO = 1644 / 674;

/** Negative-margin crop ratios to trim blank bands around Razorpay's hosted QR poster. */
export const RAZORPAY_POSTER_CROP = {
  top: 0.17,
  bottom: 0.1,
  side: 0.09,
} as const;

export const QR_POLL_INTERVAL_MS = 2000;
export const QR_PAID_CLOSE_DELAY_MS = 1600;

export function computePosterCrop(
  frameWidth: number,
  aspectRatio: number = RAZORPAY_POSTER_INITIAL_RATIO,
) {
  const safeRatio =
    Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : RAZORPAY_POSTER_INITIAL_RATIO;
  const visibleWidthFraction = 1 - RAZORPAY_POSTER_CROP.side * 2;
  const visibleHeightFraction = 1 - RAZORPAY_POSTER_CROP.top - RAZORPAY_POSTER_CROP.bottom;
  const imageWidth = frameWidth / visibleWidthFraction;
  const imageHeight = imageWidth * safeRatio;

  return {
    frameWidth,
    frameHeight: imageHeight * visibleHeightFraction,
    imageWidth,
    imageHeight,
    marginTop: -imageHeight * RAZORPAY_POSTER_CROP.top,
    marginBottom: -imageHeight * RAZORPAY_POSTER_CROP.bottom,
    marginLeft: -imageWidth * RAZORPAY_POSTER_CROP.side,
    marginRight: -imageWidth * RAZORPAY_POSTER_CROP.side,
  };
}

export function formatPaiseToRupees(amountPaise: number): string {
  const safe = Number.isFinite(amountPaise) ? Math.max(0, Math.round(amountPaise)) : 0;
  return safe % 100 === 0 ? `₹${safe / 100}` : `₹${(safe / 100).toFixed(2)}`;
}

export function formatCountdownSeconds(remainingSeconds: number): string {
  const clamped = Math.max(0, Math.floor(remainingSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function secondsUntil(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.ceil((parsed - Date.now()) / 1000));
}

export interface RidePaymentQrSheetProps {
  visible: boolean;
  rideId: string;
  cashAllowed?: boolean | undefined;
  cashBlockedReason?: string | null | undefined;
  onRide: (ride: RideDto) => void;
  onClose: () => void;
  onCash: () => void;
}

export function RidePaymentQrSheet({
  visible,
  rideId,
  cashAllowed = true,
  cashBlockedReason,
  onRide,
  onClose,
  onCash,
}: RidePaymentQrSheetProps) {
  const { token } = useAuth();
  const [qr, setQr] = useState<RidePaymentQrViewDto | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [posterRatio, setPosterRatio] = useState<number>(RAZORPAY_POSTER_INITIAL_RATIO);
  const [svgFailed, setSvgFailed] = useState<boolean>(false);

  const onRideRef = useRef(onRide);
  const onCloseRef = useRef(onClose);
  const tokenRef = useRef(token);
  const rideIdRef = useRef(rideId);

  useEffect(() => {
    onRideRef.current = onRide;
    onCloseRef.current = onClose;
    tokenRef.current = token;
    rideIdRef.current = rideId;
  }, [onRide, onClose, onCash, token, rideId]);

  const requestSeqRef = useRef(0);
  const pollInFlightRef = useRef(false);
  const paidTriggeredRef = useRef(false);
  const expiryPollSentRef = useRef(false);

  const createQr = useCallback(async () => {
    const activeToken = tokenRef.current;
    const activeRideId = rideIdRef.current;
    if (!activeToken || !activeRideId) {
      setError('Session unavailable. Please sign in again.');
      setLoading(false);
      return;
    }

    const seq = ++requestSeqRef.current;
    paidTriggeredRef.current = false;
    expiryPollSentRef.current = false;
    setQr(null);
    setError(null);
    setLoading(true);
    setRemainingSeconds(null);
    setPosterRatio(RAZORPAY_POSTER_INITIAL_RATIO);
    setSvgFailed(false);

    try {
      const response = await ridesApi.createPaymentQr(activeToken, activeRideId);
      if (requestSeqRef.current !== seq) return;
      onRideRef.current(response.ride);
      setQr(response.qr);
      setRemainingSeconds(secondsUntil(response.qr.expiresAt));
    } catch (err) {
      if (requestSeqRef.current !== seq) return;
      setError(
        err instanceof Error ? err.message : 'Unable to create UPI QR code. Please try again.',
      );
    } finally {
      if (requestSeqRef.current === seq) {
        setLoading(false);
      }
    }
  }, []);

  // Reset state on open and request a QR from the server.
  useEffect(() => {
    if (!visible) {
      requestSeqRef.current += 1;
      pollInFlightRef.current = false;
      paidTriggeredRef.current = false;
      expiryPollSentRef.current = false;
      return;
    }
    void createQr();
    return () => {
      requestSeqRef.current += 1;
    };
  }, [visible, rideId, createQr]);

  const locallyExpired =
    qr?.state === 'PENDING' && remainingSeconds !== null && remainingSeconds <= 0;

  const effectiveState: QrPaymentClientState = !qr ? 'NONE' : locallyExpired ? 'EXPIRED' : qr.state;

  // Tick countdown every 1s while QR is PENDING.
  useEffect(() => {
    if (!visible || !qr || qr.state !== 'PENDING' || !qr.expiresAt) return;
    const expiresAt = qr.expiresAt;
    const tick = () => {
      setRemainingSeconds(secondsUntil(expiresAt));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [visible, qr]);

  // When countdown hits 0 locally, notify server once so it closes the expired QR at Razorpay.
  useEffect(() => {
    if (!visible || !locallyExpired || expiryPollSentRef.current) return;
    const activeToken = tokenRef.current;
    const activeRideId = rideIdRef.current;
    if (!activeToken || !activeRideId) return;
    expiryPollSentRef.current = true;
    const seq = requestSeqRef.current;
    void ridesApi
      .pollPaymentQr(activeToken, activeRideId)
      .then((res) => {
        if (requestSeqRef.current !== seq) return;
        onRideRef.current(res.ride);
        setQr(res.qr);
      })
      .catch(() => {
        /* Ignore network failure; QR is already covered locally. */
      });
  }, [visible, locallyExpired]);

  // Poll GET every 2s ONLY while effectiveState === 'PENDING'.
  useEffect(() => {
    if (!visible || effectiveState !== 'PENDING') return;
    let cancelled = false;
    const seq = requestSeqRef.current;

    const timer = setInterval(() => {
      if (cancelled || pollInFlightRef.current) return;
      const activeToken = tokenRef.current;
      const activeRideId = rideIdRef.current;
      if (!activeToken || !activeRideId) return;

      pollInFlightRef.current = true;
      void ridesApi
        .pollPaymentQr(activeToken, activeRideId)
        .then((res) => {
          if (cancelled || requestSeqRef.current !== seq) return;
          onRideRef.current(res.ride);
          setQr(res.qr);
          setRemainingSeconds(secondsUntil(res.qr.expiresAt));
        })
        .catch(() => {
          /* Ignore transient poll errors; the next poll is 2s away. */
        })
        .finally(() => {
          pollInFlightRef.current = false;
        });
    }, QR_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      pollInFlightRef.current = false;
      clearInterval(timer);
    };
  }, [visible, effectiveState, rideId]);

  // On PAID: fire success haptic once and auto-close after ~1.6s.
  useEffect(() => {
    if (!visible || effectiveState !== 'PAID') return;
    if (!paidTriggeredRef.current) {
      paidTriggeredRef.current = true;
      try {
        Vibration?.vibrate?.([0, 60, 50, 90]);
      } catch {
        /* Haptics are best-effort. */
      }
    }
    const timer = setTimeout(() => {
      onCloseRef.current();
    }, QR_PAID_CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [visible, effectiveState]);

  const rawWidth = Dimensions?.get?.('window')?.width;
  const screenWidth = typeof rawWidth === 'number' && rawWidth > 0 ? rawWidth : 360;
  const qrSize = Math.min(Math.max(screenWidth - 64, 180), 300);
  const posterCrop = computePosterCrop(Math.min(qrSize, 252), posterRatio);
  const canSwitchToCash = cashAllowed !== false;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Collect UPI Payment</Text>
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close payment QR"
          >
            <Text style={styles.closeBtnText}>Close ✕</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {effectiveState === 'PAID' && qr ? (
            <View style={styles.paidContainer} accessibilityLiveRegion="polite">
              <View style={styles.paidCircle} accessibilityLabel="Payment received check">
                <Text style={styles.paidCheckMark}>✓</Text>
              </View>
              <Text
                style={styles.paidTitle}
              >{`${formatPaiseToRupees(qr.amountPaise)} received`}</Text>
              <Text style={styles.paidSubtitle}>
                Payment received. Your trip is complete.
              </Text>
            </View>
          ) : loading && !qr ? (
            <View style={styles.stateBox}>
              <ActivityIndicator size="large" color={colors.deepBrown} />
              <Text style={styles.stateTitle}>Making the QR code…</Text>
              <Text style={styles.hintText}>
                This will only take a moment.
              </Text>
            </View>
          ) : error && !qr ? (
            <View style={styles.stateBox}>
              <Text style={styles.errorText} accessibilityRole="alert">
                {error}
              </Text>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => void createQr()}
                accessibilityRole="button"
                accessibilityLabel="Try again"
              >
                <Text style={styles.primaryBtnText}>Try again</Text>
              </Pressable>
            </View>
          ) : qr ? (
            <View style={styles.qrSection}>
              <Text style={styles.amountHeader}>
                {`Customer pays ${formatPaiseToRupees(qr.amountPaise)}`}
              </Text>

              {qr.lines.length > 1 ? (
                <View style={styles.breakdownCard}>
                  {qr.lines.map((line) => (
                    <View key={line.label} style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>{line.label}</Text>
                      <Text style={styles.breakdownAmount}>
                        {formatPaiseToRupees(line.amountPaise)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {effectiveState === 'PENDING' ? (
                <View style={styles.qrQuietZone}>
                  {qr.upiUri && !svgFailed ? (
                    <QRCode
                      value={qr.upiUri}
                      size={qrSize}
                      ecl="M"
                      color="#000000"
                      backgroundColor="#FFFFFF"
                      onError={() => setSvgFailed(true)}
                    />
                  ) : qr.imageUrl ? (
                    <View
                      style={[
                        styles.posterViewport,
                        {
                          width: posterCrop.frameWidth,
                          height: posterCrop.frameHeight,
                        },
                      ]}
                    >
                      <Image
                        source={{ uri: qr.imageUrl }}
                        resizeMode="contain"
                        accessibilityLabel="UPI payment QR poster"
                        style={{
                          width: posterCrop.imageWidth,
                          height: posterCrop.imageHeight,
                          marginTop: posterCrop.marginTop,
                          marginBottom: posterCrop.marginBottom,
                          marginLeft: posterCrop.marginLeft,
                          marginRight: posterCrop.marginRight,
                        }}
                        onLoad={(event) => {
                          const src = event?.nativeEvent?.source;
                          if (
                            src &&
                            typeof src.width === 'number' &&
                            typeof src.height === 'number' &&
                            src.width > 0 &&
                            src.height > 0
                          ) {
                            setPosterRatio(src.height / src.width);
                          }
                        }}
                      />
                    </View>
                  ) : (
                    <View style={styles.stateBox}>
                      <Text style={styles.errorText}>QR image unavailable.</Text>
                      <Pressable
                        style={styles.primaryBtn}
                        onPress={() => void createQr()}
                        accessibilityRole="button"
                        accessibilityLabel="Try again"
                      >
                        <Text style={styles.primaryBtnText}>Try again</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ) : (
                <View
                  style={[styles.expiredFrame, { width: qrSize + 32, minHeight: qrSize + 32 }]}
                  accessibilityLabel="QR expired"
                >
                  <View style={styles.expiredDimmedBackdrop} />
                  <View style={styles.expiredOverlay}>
                    <Text style={styles.expiredTitle}>QR expired</Text>
                    <Text style={styles.expiredBody}>
                      This single-use QR has expired and cannot be scanned.
                    </Text>
                    <Pressable
                      style={styles.primaryBtn}
                      onPress={() => void createQr()}
                      disabled={loading}
                      accessibilityRole="button"
                      accessibilityLabel="Generate new QR"
                    >
                      {loading ? (
                        <ActivityIndicator color={colors.deepBrown} />
                      ) : (
                        <Text style={styles.primaryBtnText}>Generate new QR</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}

              {effectiveState === 'PENDING' ? (
                <>
                  <Text style={styles.hintText}>
                    Ask the rider to scan with any UPI app (GPay, PhonePe, Paytm, or bank app).
                  </Text>
                  <View style={styles.waitingRow}>
                    <ActivityIndicator size="small" color={colors.deepBrown} />
                    <Text style={styles.waitingText}>Waiting for payment…</Text>
                    {remainingSeconds !== null ? (
                      <View style={styles.countdownBadge}>
                        <Text style={styles.countdownText}>
                          {formatCountdownSeconds(remainingSeconds)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </>
              ) : null}
            </View>
          ) : null}

          {effectiveState !== 'PAID' ? (
            <View style={styles.footer}>
              {canSwitchToCash ? (
                <Pressable
                  style={styles.cashBtn}
                  onPress={onCash}
                  accessibilityRole="button"
                  accessibilityLabel="Customer paid cash instead"
                >
                  <Text style={styles.cashBtnText}>Customer paid cash instead</Text>
                </Pressable>
              ) : (
                <Text style={styles.cashBlockedText}>
                  {cashBlockedReason ||
                    'Cash collection is disabled while prior rider cancellation fees are due.'}
                </Text>
              )}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 52 : 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
  },
  qrSection: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  amountHeader: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  breakdownCard: {
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    backgroundColor: '#F9FAFB',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#4B5563',
  },
  breakdownAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  qrQuietZone: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterViewport: {
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignSelf: 'center',
  },
  expiredFrame: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  expiredDimmedBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#E5E7EB',
    opacity: 0.65,
  },
  expiredOverlay: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  expiredTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  expiredBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4B5563',
    textAlign: 'center',
  },
  hintText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4B5563',
    textAlign: 'center',
    maxWidth: 320,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  waitingText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  countdownBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  stateBox: {
    flex: 1,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 40,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.error,
    textAlign: 'center',
  },
  primaryBtn: {
    minHeight: 52,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  paidContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 48,
  },
  paidCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paidCheckMark: {
    fontSize: 46,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  paidTitle: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    color: '#15803D',
    textAlign: 'center',
  },
  paidSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
    textAlign: 'center',
  },
  footer: {
    width: '100%',
    maxWidth: 360,
    paddingTop: 12,
    paddingBottom: 16,
    alignItems: 'center',
  },
  cashBtn: {
    width: '100%',
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cashBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  cashBlockedText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: colors.brandBrown,
    textAlign: 'center',
  },
});
