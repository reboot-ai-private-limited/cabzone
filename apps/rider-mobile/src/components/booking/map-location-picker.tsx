import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography, createStyles } from '@/design-system';
import { useMapTheme } from '@/hooks/use-map-theme';
import { geoAndPricingApi } from '@/services/api';
import {
  createPlacesSessionToken,
  fetchPlaceCoordinates,
  fetchPlacePredictions,
  type PlaceSuggestion,
} from '@/services/places-autocomplete';
import {
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  MAP_SETTLE_MS,
  classifyPickedPoint,
  isVagueAddress,
  labelForDetails,
  roundCoordinate,
  splitAddress,
  withLandmark,
  type PickedPointStatus,
} from './map-location-picker-utils';

export interface PickedLocation {
  lat: number;
  lng: number;
  address: string;
}

export interface MapLocationPickerProps {
  visible: boolean;
  target: 'PICKUP' | 'DROP';
  token: string | null;
  /** Where the map opens: GPS/pickup point, never a blank default view. */
  initial: { lat: number; lng: number };
  /** City-to-city: search the whole country instead of ranking results near `initial`. */
  wideSearch?: boolean;
  onConfirm: (location: PickedLocation) => void;
  onClose: () => void;
}

type Lookup =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; address: string; status: PickedPointStatus };

const STREET_DELTA = 0.004;
const PIN_SIZE = 44;
const SEARCH_DEBOUNCE_MS = 280;

/**
 * "Choose on map": the pin stays fixed in the centre while the rider drags the map. The pin lifts
 * while the map moves, then drops and the centre point is reverse-geocoded into the bottom card.
 */
export function MapLocationPicker({
  visible,
  target,
  token,
  initial,
  wideSearch = false,
  onConfirm,
  onClose,
}: MapLocationPickerProps) {
  const mapRef = useRef<MapView | null>(null);
  const mapTheme = useMapTheme();
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupSeqRef = useRef(0);
  const searchSeqRef = useRef(0);

  const [center, setCenter] = useState(initial);
  const [lookup, setLookup] = useState<Lookup>({ phase: 'idle' });
  const [landmark, setLandmark] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [cardHeight, setCardHeight] = useState(260);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sessionToken] = useState(() => createPlacesSessionToken());

  const [pinLift] = useState(() => new Animated.Value(0));

  const label = target === 'DROP' ? 'destination' : 'pickup';

  useEffect(
    () => () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    },
    [],
  );

  const animatePin = useCallback(
    (lifted: boolean) => {
      Animated.spring(pinLift, {
        toValue: lifted ? -14 : 0,
        useNativeDriver: true,
        friction: 6,
        tension: 140,
      }).start();
    },
    [pinLift],
  );

  const resolve = useCallback(
    async (lat: number, lng: number) => {
      const seq = ++lookupSeqRef.current;
      setLookup({ phase: 'loading' });
      try {
        const details = await geoAndPricingApi.reverseGeocode(token, lat, lng);
        if (seq !== lookupSeqRef.current) return;
        setLookup({
          phase: 'ready',
          address: labelForDetails(details),
          status: classifyPickedPoint(details),
        });
      } catch {
        if (seq !== lookupSeqRef.current) return;
        // The address lookup is down: the rider can still confirm and add a landmark.
        setLookup({ phase: 'ready', address: 'Selected location', status: 'ok' });
      }
    },
    [token],
  );

  const handleMapReady = useCallback(() => {
    void resolve(initial.lat, initial.lng);
  }, [initial.lat, initial.lng, resolve]);

  const handlePanDrag = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    animatePin(true);
    lookupSeqRef.current += 1;
    setLookup((prev) => (prev.phase === 'loading' ? prev : { phase: 'loading' }));
  }, [animatePin]);

  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      const lat = roundCoordinate(region.latitude);
      const lng = roundCoordinate(region.longitude);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(() => {
        animatePin(false);
        setCenter({ lat, lng });
        setLandmark('');
        void resolve(lat, lng);
      }, MAP_SETTLE_MS);
    },
    [animatePin, resolve],
  );

  const flyTo = useCallback((lat: number, lng: number) => {
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: STREET_DELTA, longitudeDelta: STREET_DELTA },
      500,
    );
  }, []);

  const handleRecenter = useCallback(async () => {
    setIsLocating(true);
    setNotice(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setPermissionDenied(true);
        setNotice('Location is off. Search for a place, or turn on location to use your GPS.');
        return;
      }
      setPermissionDenied(false);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      flyTo(pos.coords.latitude, pos.coords.longitude);
    } catch {
      setNotice('Could not read your GPS position. Move the map or search for a place.');
    } finally {
      setIsLocating(false);
    }
  }, [flyTo]);

  const handleSearchChange = useCallback(
    (text: string) => {
      setQuery(text);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      const trimmed = text.trim();
      const seq = ++searchSeqRef.current;
      if (trimmed.length < 2) {
        setResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      searchTimerRef.current = setTimeout(async () => {
        try {
          const found = await fetchPlacePredictions(trimmed, {
            sessionToken,
            ...(wideSearch ? { radiusMeters: 0 } : { latitude: initial.lat, longitude: initial.lng }),
          });
          if (seq === searchSeqRef.current) setResults(found);
        } catch {
          if (seq === searchSeqRef.current) setResults([]);
        } finally {
          if (seq === searchSeqRef.current) setIsSearching(false);
        }
      }, SEARCH_DEBOUNCE_MS);
    },
    [sessionToken, wideSearch, initial.lat, initial.lng],
  );

  const handleSelectResult = useCallback(
    async (item: PlaceSuggestion) => {
      Keyboard.dismiss();
      setQuery(item.name);
      setResults([]);
      try {
        const coords =
          typeof item.lat === 'number' && typeof item.lng === 'number'
            ? { lat: item.lat, lng: item.lng }
            : await fetchPlaceCoordinates(item.id, { sessionToken });
        if (coords) {
          flyTo(coords.lat, coords.lng);
        } else {
          setNotice('Could not find that place on the map. Try another search.');
        }
      } catch {
        setNotice('Could not reach place search. Check your connection and try again.');
      }
    },
    [flyTo, sessionToken],
  );

  const handleConfirm = useCallback(() => {
    if (lookup.phase !== 'ready' || lookup.status !== 'ok') return;
    onConfirm({
      lat: center.lat,
      lng: center.lng,
      address: withLandmark(lookup.address, landmark),
    });
  }, [center.lat, center.lng, landmark, lookup, onConfirm]);

  const isReady = lookup.phase === 'ready';
  const unserviceable = lookup.phase === 'ready' && lookup.status === 'unserviceable';
  const canConfirm = isReady && !unserviceable;
  const vague = lookup.phase === 'ready' && isVagueAddress(lookup.address);
  const parts = lookup.phase === 'ready' ? splitAddress(lookup.address) : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          mapType={mapTheme.mapType}
          userInterfaceStyle={mapTheme.userInterfaceStyle}
          customMapStyle={mapTheme.customMapStyle}
          initialRegion={{
            latitude: initial.lat,
            longitude: initial.lng,
            latitudeDelta: STREET_DELTA,
            longitudeDelta: STREET_DELTA,
          }}
          minZoomLevel={MAP_MIN_ZOOM}
          maxZoomLevel={MAP_MAX_ZOOM}
          showsUserLocation={!permissionDenied}
          showsMyLocationButton={false}
          showsCompass={false}
          toolbarEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          onMapReady={handleMapReady}
          onPanDrag={handlePanDrag}
          onRegionChangeComplete={handleRegionChangeComplete}
        />

        {/* Fixed centre pin: the tip sits exactly on the map centre. */}
        <View pointerEvents="none" style={styles.pinLayer}>
          <View style={styles.pinShadow} />
          <Animated.View style={[styles.pin, { transform: [{ translateY: pinLift }] }]}>
            <Ionicons name="location-sharp" size={PIN_SIZE} color={colors.brandBrown} />
          </Animated.View>
        </View>

        <SafeAreaView style={styles.topOverlay} edges={['top']} pointerEvents="box-none">
          <View style={styles.topRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close map"
              onPress={onClose}
              style={styles.circleButton}
            >
              <Ionicons name="arrow-back" size={22} color={colors.deepBrown} />
            </Pressable>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={colors.secondary} />
              <TextInput
                style={styles.searchInput}
                placeholder={target === 'DROP' ? 'Search destination' : 'Search pickup area'}
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={handleSearchChange}
                returnKeyType="search"
                accessibilityLabel="Search places on map"
              />
              {isSearching ? <ActivityIndicator size="small" color={colors.brandBrown} /> : null}
              {query.length > 0 && !isSearching ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={8}
                  onPress={() => handleSearchChange('')}
                >
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          </View>
          <Text style={styles.titlePill} accessibilityRole="header">
            {target === 'DROP' ? 'Set destination' : 'Set pickup'}
          </Text>
          {results.length > 0 ? (
            <ScrollView
              style={styles.results}
              keyboardShouldPersistTaps="handled"
              accessibilityLabel="Search results"
            >
              {results.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.resultRow}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to ${item.name}`}
                  onPress={() => void handleSelectResult(item)}
                >
                  <Ionicons name="location-outline" size={20} color={colors.brandBrown} />
                  <View style={styles.resultCopy}>
                    <Text style={styles.resultTitle} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.resultSub} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </SafeAreaView>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recenter on my location"
          onPress={() => void handleRecenter()}
          style={[styles.recenter, { bottom: cardHeight + spacing.md }]}
        >
          {isLocating ? (
            <ActivityIndicator size="small" color={colors.deepBrown} />
          ) : (
            <Ionicons name="locate" size={24} color={colors.deepBrown} />
          )}
        </Pressable>

        <SafeAreaView
          style={styles.bottomCard}
          edges={['bottom']}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        >
          {notice ? (
            <View style={styles.noticeRow}>
              <Text style={styles.noticeText} accessibilityRole="alert">
                {notice}
              </Text>
              {permissionDenied ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open location settings"
                  onPress={() => void Linking.openSettings()}
                >
                  <Text style={styles.noticeAction}>Settings</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.cardLabel}>{label.toUpperCase()}</Text>
          {lookup.phase === 'ready' && parts ? (
            <View>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {vague ? 'Pinned location' : parts.title}
              </Text>
              <Text style={styles.cardArea} numberOfLines={2}>
                {vague ? 'Add a landmark so your driver can find you' : parts.area || lookup.address}
              </Text>
            </View>
          ) : (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.brandBrown} />
              <Text style={styles.cardArea}>Locating…</Text>
            </View>
          )}

          {unserviceable ? (
            <Text style={styles.errorText} accessibilityRole="alert">
              We don&apos;t serve this area. Move the pin to a location inside India.
            </Text>
          ) : null}

          {isReady && !unserviceable ? (
            <TextInput
              style={styles.landmarkInput}
              placeholder="Add a landmark (e.g. near the blue gate, opposite SBI)"
              placeholderTextColor={colors.muted}
              value={landmark}
              onChangeText={setLandmark}
              maxLength={80}
              returnKeyType="done"
              accessibilityLabel="Landmark note for the driver"
            />
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Confirm ${label}`}
            accessibilityState={{ disabled: !canConfirm }}
            disabled={!canConfirm}
            onPress={handleConfirm}
            style={[styles.confirmButton, !canConfirm && styles.confirmDisabled]}
          >
            <Text style={styles.confirmText}>Confirm {label}</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = createStyles(() => ({
  screen: { flex: 1, backgroundColor: colors.white },
  pinLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Lift the icon by its own height so the pin tip (not its middle) marks the centre.
  pin: { marginBottom: PIN_SIZE },
  pinShadow: {
    position: 'absolute',
    width: 10,
    height: 4,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  searchBar: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  searchInput: { flex: 1, ...typography.body, color: colors.deepBrown, paddingVertical: 0 },
  titlePill: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    overflow: 'hidden',
    backgroundColor: colors.deepBrown,
    color: colors.white,
    ...typography.caption,
  },
  results: {
    maxHeight: 260,
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    elevation: 4,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultCopy: { flex: 1 },
  resultTitle: { ...typography.bodyBold, color: colors.deepBrown },
  resultSub: { ...typography.caption, color: colors.secondary },
  recenter: {
    position: 'absolute',
    right: spacing.lg,
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  bottomCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    backgroundColor: colors.white,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  cardLabel: { ...typography.caption, color: colors.brandBrown, letterSpacing: 0.8 },
  cardTitle: { ...typography.h2, color: colors.deepBrown },
  cardArea: { ...typography.body, color: colors.secondary },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  errorText: { ...typography.bodyBold, color: colors.error },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.warningBg,
  },
  noticeText: { flex: 1, ...typography.caption, color: colors.warning },
  noticeAction: { ...typography.bodyBold, color: colors.brandBrown },
  landmarkInput: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
    color: colors.deepBrown,
  },
  confirmButton: {
    minHeight: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDisabled: { opacity: 0.45 },
  confirmText: { ...typography.h2, color: colors.deepBrown },
}));
