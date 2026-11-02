import { tollDisclosure, type QuoteDto, type VehicleCategory } from '@cabzone/contracts';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BookingHome } from './booking-home';
import BookingMap from './booking-map';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, typography } from '@/design-system';
import { ERickshawIcon } from '@/components/common/e-rickshaw-icon';
import { RoutePointIcon } from '@/components/common/route-point-icon';
import { useAuth } from '@/context/auth-context';
import { useRide } from '@/context/ride-context';
import { geoAndPricingApi, isApiError } from '@/services/api';
import {
  PLACE_PRESETS,
  clampProposedFarePaise,
  createBookingIdempotencyKey,
  extractActiveRideConflictId,
  formatRupeesFromPaise,
  getRideStatusMeta,
  normalizeIndianPhoneE164,
  type PlacePreset,
} from '@/services/rider-helpers';
import {
  fetchPlacePredictions,
  fetchPlaceCoordinates,
  createPlacesSessionToken,
  type PlaceSuggestion,
} from '@/services/places-autocomplete';

interface LocationSelection {
  lat: number;
  lng: number;
  address: string;
}

interface RideBookingComposerProps {
  mode: 'IN_CITY' | 'OUTSTATION';
}

export function RideBookingComposer({ mode }: RideBookingComposerProps) {
  const router = useRouter();
  const { token, user, profile, templates, addTemplate, removeTemplate, preferences } = useAuth();
  const { activeRide, createRide, bookingDraft, setBookingDraft } = useRide();

  const defaultPickup = useMemo<LocationSelection>(() => {
    const p = PLACE_PRESETS[0];
    return { lat: p.lat, lng: p.lng, address: p.name };
  }, []);

  const defaultDrop = useMemo<LocationSelection>(() => {
    const p = mode === 'OUTSTATION' ? PLACE_PRESETS[5] : PLACE_PRESETS[1];
    return { lat: p.lat, lng: p.lng, address: p.name };
  }, [mode]);

  const [pickup, setPickup] = useState<LocationSelection>(defaultPickup);
  const [bookingStarted, setBookingStarted] = useState(false);
  const [isRideSelected, setIsRideSelected] = useState(false);
  const [drop, setDrop] = useState<LocationSelection>(defaultDrop);
  const [locationNote, setLocationNote] = useState('');

  // Passenger ("For Me" vs "Someone Else")
  const [forSomeoneElse, setForSomeoneElse] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [showPassengerModal, setShowPassengerModal] = useState(false);

  // Place Picker Modal
  const [pickerTarget, setPickerTarget] = useState<'PICKUP' | 'DROP' | null>(null);
  const [pickerOnMap, setPickerOnMap] = useState(false);
  const [placeSearchQuery, setPlaceSearchQuery] = useState('');
  const [autocompleteResults, setAutocompleteResults] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const placesSessionTokenRef = useRef<string | null>(null);
  const searchDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [customLat, setCustomLat] = useState('');
  const [customLng, setCustomLng] = useState('');
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [isResolvingPin, setIsResolvingPin] = useState(false);

  // Quote & Fare Negotiation state
  const [selectedCategory, setSelectedCategory] = useState<VehicleCategory>('CAB');
  const [quotes, setQuotes] = useState<QuoteDto[]>([]);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [proposedFarePaise, setProposedFarePaise] = useState<number>(0);
  const preferredFareRef = useRef<number | null>(null);
  const [showEditFareModal, setShowEditFareModal] = useState(false);
  const [editFareInput, setEditFareInput] = useState<string>('');
  const [editFareError, setEditFareError] = useState<string | null>(null);

  // Submitting ride
  const [isSubmittingRide, setIsSubmittingRide] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [templateSavedToast, setTemplateSavedToast] = useState<string | null>(null);
  const pendingBookingAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const submittingRideRef = useRef(false);

  // Start from the rider's real position; the preset stays only if GPS is unavailable or the rider already chose.
  useEffect(() => {
    let off = false;
    void (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted || off) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        let address = 'Current location';
        try {
          const r = await geoAndPricingApi.reverseGeocode(token, lat, lng);
          address = r.formattedAddress || r.city || address;
        } catch {
          // keep readable label
        }
        if (!off) setPickup((prev) => (prev === defaultPickup ? { lat, lng, address } : prev));
      } catch {
        // GPS unavailable: preset pickup stays and the locate button still works
      }
    })();
    return () => {
      off = true;
    };
  }, [defaultPickup, token]);

  const openPlacePicker = (target: 'PICKUP' | 'DROP') => {
    setPickerTarget(target);
    setPickerOnMap(false);
    setPlaceSearchQuery('');
    setAutocompleteResults([]);
    setIsSearchingPlaces(false);
    placesSessionTokenRef.current = createPlacesSessionToken();
    setCustomLat('');
    setCustomLng('');
    setSubmitError(null);
  };

  const handleBack = useCallback(() => {
    if (isRideSelected) {
      setIsRideSelected(false);
      return;
    }
    if (bookingStarted) {
      setBookingStarted(false);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    }
  }, [isRideSelected, bookingStarted, router]);

  useFocusEffect(
    useCallback(() => {
    const onHardwareBack = () => {
      if (isRideSelected) {
        setIsRideSelected(false);
        return true;
      }
      if (bookingStarted) {
        setBookingStarted(false);
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
    }, [isRideSelected, bookingStarted]),
  );

  const closePlacePicker = () => {
    setPickerTarget(null);
    setPickerOnMap(false);
    setPlaceSearchQuery('');
    setAutocompleteResults([]);
    setIsSearchingPlaces(false);
    placesSessionTokenRef.current = null;
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
    }
  };

  // Debounced Google Places Autocomplete search
  useEffect(() => {
    const q = placeSearchQuery.trim();
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
    }

    if (q.length < 2) {
      const resetTimer = setTimeout(() => {
        setAutocompleteResults([]);
        setIsSearchingPlaces(false);
      }, 0);
      return () => clearTimeout(resetTimer);
    }

    let stale = false;
    const showSpinnerTimer = setTimeout(() => {
      if (!stale) setIsSearchingPlaces(true);
    }, 0);
    searchDebounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await fetchPlacePredictions(q, {
          sessionToken: placesSessionTokenRef.current || undefined,
        });
        if (!stale) setAutocompleteResults(results);
      } catch {
        if (!stale) setAutocompleteResults([]);
      } finally {
        if (!stale) setIsSearchingPlaces(false);
      }
    }, 280);

    return () => {
      stale = true;
      clearTimeout(showSpinnerTimer);
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }
    };
  }, [placeSearchQuery]);

  // Apply bookingDraft when navigated from Activity ("Repeat Ride" / "Return Trip") or Saved Templates
  useEffect(() => {
    if (!bookingDraft || bookingDraft.mode !== mode) return;
    const draft = bookingDraft;
    const timer = setTimeout(() => {
      setPickup(draft.pickup);
      setDrop(draft.drop);
      preferredFareRef.current = draft.preferredFarePaise ?? null;
      if (draft.vehicleCategory) setSelectedCategory(draft.vehicleCategory);
      setBookingStarted(true);
      setBookingDraft(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [bookingDraft, mode, setBookingDraft]);

  // Fetch quote whenever pickup or drop changes
  const quoteSeqRef = useRef(0);
  const fetchQuotes = useCallback(async () => {
    if (!bookingStarted) return;
    const seq = ++quoteSeqRef.current;
    if (Math.abs(pickup.lat - drop.lat) < 0.0001 && Math.abs(pickup.lng - drop.lng) < 0.0001) {
      setQuoteError('Pickup and drop locations must be different.');
      setQuotes([]);
      return;
    }

    setIsLoadingQuote(true);
    setQuoteError(null);
    setSubmitError(null);
    setQuotes([]);
    try {
      const response = await geoAndPricingApi.createQuote(token, {
        pickup: { lat: pickup.lat, lng: pickup.lng },
        drop: { lat: drop.lat, lng: drop.lng },
        vehicleCategory: selectedCategory,
      });
      if (seq !== quoteSeqRef.current) return;
      setQuotes([response]);
      const fare =
        preferredFareRef.current === null
          ? response.suggestedFarePaise
          : clampProposedFarePaise(
              preferredFareRef.current,
              response.negotiation.floorPaise,
              response.negotiation.ceilingPaise,
            );
      preferredFareRef.current = null;
      setProposedFarePaise(fare);
    } catch (err: unknown) {
      if (seq !== quoteSeqRef.current) return;
      setQuotes([]);
      setQuoteError(
        err instanceof Error ? err.message : 'Unable to calculate fare quote for this route.',
      );
    } finally {
      if (seq === quoteSeqRef.current) setIsLoadingQuote(false);
    }
  }, [drop.lat, drop.lng, pickup.lat, pickup.lng, token, bookingStarted, selectedCategory]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchQuotes();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchQuotes]);

  const activeQuote = useMemo(
    () => quotes.find((q) => q.vehicleCategory === selectedCategory) ?? quotes[0] ?? null,
    [quotes, selectedCategory],
  );

  const handleAdjustFare = (deltaPaise: number) => {
    if (!activeQuote) return;
    const next = clampProposedFarePaise(
      proposedFarePaise + deltaPaise,
      activeQuote.negotiation.floorPaise,
      activeQuote.negotiation.ceilingPaise,
    );
    setProposedFarePaise(next);
  };

  const handleOpenEditFare = () => {
    setEditFareInput(String(Math.round(proposedFarePaise / 100)));
    setEditFareError(null);
    setShowEditFareModal(true);
  };

  const handleFareInputChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    setEditFareInput(cleaned);
    if (!activeQuote) return;
    if (!cleaned) {
      setEditFareError('Enter a fare amount');
      return;
    }
    const val = Number(cleaned);
    const floorRupees = Math.round(activeQuote.negotiation.floorPaise / 100);
    const ceilingRupees = Math.round(activeQuote.negotiation.ceilingPaise / 100);
    if (val < floorRupees) {
      setEditFareError(`Minimum fare is ₹${floorRupees}`);
    } else if (val > ceilingRupees) {
      setEditFareError(`Maximum fare is ₹${ceilingRupees}`);
    } else {
      setEditFareError(null);
    }
  };

  const handleApplyCustomFare = () => {
    if (!activeQuote) return;
    const val = Number(editFareInput.replace(/[^0-9]/g, ''));
    const floorRupees = Math.round(activeQuote.negotiation.floorPaise / 100);
    const ceilingRupees = Math.round(activeQuote.negotiation.ceilingPaise / 100);
    if (!val || val < floorRupees || val > ceilingRupees) {
      return;
    }
    setProposedFarePaise(val * 100);
    setShowEditFareModal(false);
  };

  const handleSwapLocations = () => {
    setPickup(drop);
    setDrop(pickup);
  };

  const handleUseCurrentGps = async (target = pickerTarget) => {
    setIsLocatingGps(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setSubmitError('Location permission denied. Choose a place or pick a point on the map.');
        return;
      }
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('gps timeout')), 12000)),
      ]);
      const lat = Number(pos.coords.latitude.toFixed(5));
      const lng = Number(pos.coords.longitude.toFixed(5));
      let address = 'Current location';
      try {
        const resolved = await geoAndPricingApi.reverseGeocode(token, lat, lng);
        if (resolved.formattedAddress) {
          address = resolved.formattedAddress;
        } else if (resolved.city) {
          address = `${resolved.city}${resolved.state ? `, ${resolved.state}` : ''}`;
        }
      } catch {
        // Keep a readable label when address lookup is unavailable.
      }
      if (target === 'DROP') {
        setBookingStarted(true);
        setDrop({ lat, lng, address });
      } else {
        setPickup({ lat, lng, address });
      }
      closePlacePicker();
    } catch {
      setSubmitError('Could not read GPS location. Select a place from the list.');
    } finally {
      setIsLocatingGps(false);
    }
  };

  const handleSelectSuggestion = async (item: PlaceSuggestion | PlacePreset) => {
    // If it's a preset or already has coordinates:
    if ('lat' in item && typeof item.lat === 'number' && typeof item.lng === 'number') {
      const loc: LocationSelection = {
        lat: item.lat,
        lng: item.lng,
        address: item.name,
      };
      if (pickerTarget === 'DROP') {
        setBookingStarted(true);
        setDrop(loc);
      } else {
        setPickup(loc);
      }
      closePlacePicker();
      return;
    }

    // Google Place suggestion: fetch coordinates
    try {
      setIsSearchingPlaces(true);
      const coords = await fetchPlaceCoordinates(item.id, {
        sessionToken: placesSessionTokenRef.current || undefined,
      });
      if (coords) {
        const loc: LocationSelection = {
          lat: coords.lat,
          lng: coords.lng,
          address: coords.address || item.name,
        };
        if (pickerTarget === 'DROP') {
          setBookingStarted(true);
          setDrop(loc);
        } else {
          setPickup(loc);
        }
        closePlacePicker();
      } else {
        setSubmitError('Could not locate the selected place. Try choosing on map.');
      }
    } catch {
      setSubmitError('Could not reach Google Places. Please try again.');
    } finally {
      setIsSearchingPlaces(false);
    }
  };

  const handleSelectPreset = (preset: PlacePreset) => {
    void handleSelectSuggestion(preset);
  };

  const handleApplyCustomCoords = async () => {
    const target = pickerTarget;
    if (!target) return;
    const lat = Number(customLat);
    const lng = Number(customLng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return;
    }
    setIsResolvingPin(true);
    let address = 'Selected location';
    try {
      const resolved = await geoAndPricingApi.reverseGeocode(token, lat, lng);
      address =
        resolved.formattedAddress ||
        [resolved.city, resolved.state].filter(Boolean).join(', ') ||
        address;
    } catch {
      // Keep the selected-location label when lookup is unavailable.
    } finally {
      setIsResolvingPin(false);
    }
    const loc: LocationSelection = { lat, lng, address };
    if (target === 'DROP') {
      setBookingStarted(true);
      setDrop(loc);
    } else {
      setPickup(loc);
    }
    closePlacePicker();
    setCustomLat('');
    setCustomLng('');
  };

  const matchingTemplate = useMemo(() => {
    return templates.find((t) => {
      if (t.mode !== mode) return false;
      const samePickup =
        (Math.abs(t.pickup.lat - pickup.lat) < 0.0002 && Math.abs(t.pickup.lng - pickup.lng) < 0.0002) ||
        t.pickup.address.trim().toLowerCase() === pickup.address.trim().toLowerCase();
      const sameDrop =
        (Math.abs(t.drop.lat - drop.lat) < 0.0002 && Math.abs(t.drop.lng - drop.lng) < 0.0002) ||
        t.drop.address.trim().toLowerCase() === drop.address.trim().toLowerCase();
      return samePickup && sameDrop;
    });
  }, [templates, mode, pickup, drop]);

  const isRouteSaved = Boolean(matchingTemplate);

  const handleToggleSaveRoute = async () => {
    try {
      if (matchingTemplate) {
        await removeTemplate(matchingTemplate.id);
        setTemplateSavedToast('Removed from saved routes');
      } else {
        const label = `${pickup.address.split(',')[0]} → ${drop.address.split(',')[0]}`;
        await addTemplate({
          label,
          mode,
          pickup,
          drop,
        });
        setTemplateSavedToast('Route saved to favorites');
      }
    } catch {
      setTemplateSavedToast('Could not update saved routes');
    }
    setTimeout(() => setTemplateSavedToast(null), 2500);
  };

  const handleBookRide = async () => {
    if (!activeQuote || activeRide || isSubmittingRide || submittingRideRef.current) return;
    setSubmitError(null);

    let passengerName = profile?.name?.trim() || 'Cabzone Rider';
    let passengerPhone = user?.phoneE164 ?? '';
    if (!forSomeoneElse && !passengerPhone) {
      setSubmitError('Your phone number is missing. Please sign in again.');
      return;
    }

    if (forSomeoneElse) {
      const trimmedName = guestName.trim();
      const normalizedPhone = normalizeIndianPhoneE164(guestPhone);
      if (!trimmedName) {
        setSubmitError('Please enter the passenger name for "Someone else".');
        setShowPassengerModal(true);
        return;
      }
      if (!normalizedPhone) {
        setSubmitError('Please enter a valid 10-digit Indian mobile number for the passenger.');
        setShowPassengerModal(true);
        return;
      }
      passengerName = trimmedName;
      passengerPhone = normalizedPhone;
    }

    const fingerprint = JSON.stringify([
      activeQuote.quoteToken,
      proposedFarePaise,
      passengerName,
      passengerPhone,
      selectedCategory,
      pickup.lat,
      pickup.lng,
      pickup.address,
      drop.lat,
      drop.lng,
      drop.address,
    ]);
    if (pendingBookingAttemptRef.current?.fingerprint !== fingerprint) {
      pendingBookingAttemptRef.current = {
        fingerprint,
        key: createBookingIdempotencyKey(),
      };
    }
    const idempotencyKey = pendingBookingAttemptRef.current.key;

    submittingRideRef.current = true;
    setIsSubmittingRide(true);
    try {
      const created = await createRide({
        quoteToken: activeQuote.quoteToken,
        proposedFarePaise,
        idempotencyKey,
        passenger: {
          name: passengerName,
          phoneE164: passengerPhone,
        },
        vehicleCategory: selectedCategory,
        pickup: {
          lat: pickup.lat,
          lng: pickup.lng,
          address: pickup.address,
        },
        drop: {
          lat: drop.lat,
          lng: drop.lng,
          address: drop.address,
        },
      });
      pendingBookingAttemptRef.current = null;
      router.push(`/(rider)/ride/${created.id}`);
    } catch (err: unknown) {
      if (!(isApiError(err) && err.isNetworkError)) {
        pendingBookingAttemptRef.current = null;
      }
      const conflictRideId = extractActiveRideConflictId(err);
      if (conflictRideId) {
        router.push(`/(rider)/ride/${conflictRideId}`);
        return;
      }
      setSubmitError(
        err instanceof Error ? err.message : 'Could not create ride. Please try again.',
      );
    } finally {
      submittingRideRef.current = false;
      setIsSubmittingRide(false);
    }
  };

  const filteredPresets = useMemo(() => {
    const q = placeSearchQuery.trim().toLowerCase();
    return PLACE_PRESETS.filter((p) => {
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q)
      );
    });
  }, [placeSearchQuery]);

  const displayItems = useMemo(() => {
    const q = placeSearchQuery.trim();
    if (!q) {
      return PLACE_PRESETS.map((p) => ({
        id: p.id,
        name: p.name,
        subtitle: p.subtitle,
        isPreset: true,
        lat: p.lat,
        lng: p.lng,
        category: p.category,
      }));
    }

    if (autocompleteResults.length > 0) {
      return autocompleteResults;
    }

    return filteredPresets.map((p) => ({
      id: p.id,
      name: p.name,
      subtitle: p.subtitle,
      isPreset: true,
      lat: p.lat,
      lng: p.lng,
      category: p.category,
    }));
  }, [placeSearchQuery, autocompleteResults, filteredPresets]);

  const pinCandidate: LocationSelection | null =
    customLat !== '' && customLng !== ''
      ? {
          lat: Number(customLat),
          lng: Number(customLng),
          address: 'Selected location',
        }
      : null;

  const formattedDistance = useMemo(() => {
    if (!activeQuote) return '--';
    const km = activeQuote.distanceM / 1000;
    if (preferences.distanceUnit === 'mi') {
      return `${(km * 0.621371).toFixed(1)} mi`;
    }
    return `${km.toFixed(1)} km`;
  }, [activeQuote, preferences.distanceUnit]);

  const formattedDuration = useMemo(() => {
    if (!activeQuote) return '--';
    const mins = Math.max(1, Math.round(activeQuote.estimatedDurationSeconds / 60));
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const rem = mins % 60;
      return `${hrs}h ${rem}m`;
    }
    return `${mins} min`;
  }, [activeQuote]);

  const modeTemplates = useMemo(
    () => templates.filter((t) => t.mode === mode).slice(0, 4),
    [mode, templates],
  );

  const isMinFare = activeQuote ? proposedFarePaise <= activeQuote.negotiation.floorPaise : false;
  const isMaxFare = activeQuote ? proposedFarePaise >= activeQuote.negotiation.ceilingPaise : false;

  const topCard = (
    <View style={styles.topCardWrapper}>
      <View style={styles.topFloatingCard}>
        {/* Back Button */}
        <Pressable
          style={styles.topBackBtn}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>

        {/* Route Points & Addresses */}
        <View style={styles.topRouteContent}>
          {/* Pickup Row */}
          <Pressable
            style={styles.topLocationRow}
            onPress={() => openPlacePicker('PICKUP')}
            accessibilityRole="button"
            accessibilityLabel={`Pickup location: ${pickup.address}`}
          >
            <RoutePointIcon type="pickup" size={16} />
            <Text style={styles.topAddressText} numberOfLines={1}>
              {pickup.address}
            </Text>
          </Pressable>

          {/* Connector Line */}
          <View style={styles.topConnectorLine} />

          {/* Drop Row */}
          <Pressable
            style={styles.topLocationRow}
            onPress={() => openPlacePicker('DROP')}
            accessibilityRole="button"
            accessibilityLabel={`Drop-off destination: ${drop.address}`}
          >
            <RoutePointIcon type="drop" size={16} />
            <Text style={styles.topAddressText} numberOfLines={1}>
              {drop.address}
            </Text>
          </Pressable>
        </View>

        {/* Actions Column (Star + Swap) */}
        <View style={styles.topActionsCol}>
          <Pressable
            style={styles.topActionIconBtn}
            onPress={() => void handleToggleSaveRoute()}
            accessibilityRole="button"
            accessibilityLabel={isRouteSaved ? 'Unsave this route' : 'Save route to favorites'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isRouteSaved ? 'star' : 'star-outline'}
              size={22}
              color={isRouteSaved ? '#D97706' : '#111827'}
            />
          </Pressable>

          <Pressable
            style={styles.topActionIconBtn}
            onPress={handleSwapLocations}
            accessibilityRole="button"
            accessibilityLabel="Swap pickup and drop-off locations"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="swap-vertical" size={22} color="#111827" />
          </Pressable>
        </View>
      </View>

      {templateSavedToast ? (
        <View style={styles.toastPill}>
          <Text style={styles.toastText}>✓ {templateSavedToast}</Text>
        </View>
      ) : null}
    </View>
  );

  const bottomCard = (
    <View style={styles.bottomSheetContainer}>
      {/* Top Drag Handle */}
      <View style={styles.sheetDragHandle} />

      {/* Active Ride Recovery Banner if active */}
      {activeRide ? (
        <Pressable
          style={styles.activeRideBanner}
          onPress={() => router.push(`/(rider)/ride/${activeRide.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Open blocking ride: ${getRideStatusMeta(activeRide.status).label}`}
        >
          <View style={styles.activeRideBannerLeft}>
            <View style={styles.pulseDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeRideBannerTitle}>
                {activeRide.status === 'PAYMENT_PENDING' ||
                activeRide.status === 'TRIP_COMPLETED' ||
                activeRide.status === 'PAYMENT_UNPAID'
                  ? `Payment due · ${formatRupeesFromPaise((activeRide.agreedFarePaise ?? activeRide.proposedFarePaise ?? activeRide.suggestedFarePaise) + (activeRide.arrearsPaise ?? 0))}`
                  : `Active Ride · ${getRideStatusMeta(activeRide.status).label}`}
              </Text>
              <Text style={styles.activeRideBannerSub} numberOfLines={1}>
                {activeRide.status === 'PAYMENT_UNPAID'
                  ? 'Pay via UPI or dispute to unlock your next ride'
                  : activeRide.status === 'PAYMENT_PENDING' ||
                      activeRide.status === 'TRIP_COMPLETED'
                    ? 'Pay via UPI or tap "I paid cash to driver" to unlock next ride'
                    : 'Tap to open your current trip'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.deepBrown} />
        </Pressable>
      ) : null}

      {/* Fare Section Header: Your fare | Edit fare */}
      <View style={styles.fareHeaderRow}>
        <Text style={styles.fareTitleText}>Your fare</Text>
        {activeQuote ? (
          <Pressable
            style={styles.editFareRow}
            onPress={handleOpenEditFare}
            accessibilityRole="button"
            accessibilityLabel="Edit fare amount"
          >
            <Ionicons name="pencil" size={15} color="#D97706" />
            <Text style={styles.editFareText}>Edit fare</Text>
          </Pressable>
        ) : null}
      </View>

      {quoteError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <Text style={styles.errorText}>{quoteError}</Text>
          <Pressable style={styles.retryChip} onPress={() => void fetchQuotes()}>
            <Text style={styles.retryChipText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* Fare Counter Row (3 pills) */}
          <View style={styles.farePillsRow}>
            {/* Left Pill: Decrease fare by ₹10 */}
            <Pressable
              style={[
                styles.fareAdjustPill,
                (isMinFare || !activeQuote || isLoadingQuote || isSubmittingRide) &&
                  styles.farePillDisabled,
              ]}
              onPress={() => handleAdjustFare(-1000)}
              disabled={isMinFare || !activeQuote || isLoadingQuote || isSubmittingRide}
              accessibilityRole="button"
              accessibilityLabel="Decrease fare by 10 rupees"
              accessibilityState={{ disabled: isMinFare || !activeQuote }}
            >
              <Text style={styles.fareAdjustSign}>—</Text>
              <Text style={styles.fareAdjustAmount}>₹10</Text>
            </Pressable>

            {/* Center Pill: Hero Proposed Fare */}
            <View style={styles.fareHeroPill}>
              {isLoadingQuote ? (
                <ActivityIndicator color="#111827" size="small" />
              ) : (
                <Text style={styles.fareHeroAmount}>
                  {activeQuote ? formatRupeesFromPaise(proposedFarePaise) : '--'}
                </Text>
              )}
            </View>

            {/* Right Pill: Increase fare by ₹10 */}
            <Pressable
              style={[
                styles.fareAdjustPill,
                (isMaxFare || !activeQuote || isLoadingQuote || isSubmittingRide) &&
                  styles.farePillDisabled,
              ]}
              onPress={() => handleAdjustFare(1000)}
              disabled={isMaxFare || !activeQuote || isLoadingQuote || isSubmittingRide}
              accessibilityRole="button"
              accessibilityLabel="Increase fare by 10 rupees"
              accessibilityState={{ disabled: isMaxFare || !activeQuote }}
            >
              <Text style={styles.fareAdjustSign}>+</Text>
              <Text style={styles.fareAdjustAmount}>₹10</Text>
            </Pressable>
          </View>

          {/* Toll disclosure subtext */}
          <Text style={styles.tollDisclaimerText}>Toll/permit extra (at actuals).</Text>

          {/* Hero CTA Button: Find Cab -> */}
          <Pressable
            style={[
              styles.findCabHeroButton,
              (!activeQuote || !!activeRide || isLoadingQuote || isSubmittingRide) &&
                styles.findCabHeroDisabled,
            ]}
            onPress={() => void handleBookRide()}
            disabled={!activeQuote || !!activeRide || isLoadingQuote || isSubmittingRide}
            accessibilityRole="button"
            accessibilityLabel={
              activeQuote
                ? `Find ${selectedCategory === 'CAB' ? 'Cab' : 'Ride'} for ${formatRupeesFromPaise(proposedFarePaise)}`
                : 'Find Cab'
            }
            accessibilityState={{
              disabled: !activeQuote || !!activeRide || isLoadingQuote || isSubmittingRide,
              busy: isSubmittingRide,
            }}
          >
            {isSubmittingRide ? (
              <View style={styles.submittingContent}>
                <ActivityIndicator color="#111827" size="small" />
                <Text style={styles.findCabHeroText}>Finding cab...</Text>
              </View>
            ) : (
              <View style={styles.findCabRow}>
                <Text style={styles.findCabHeroText}>Find Cab</Text>
                <Ionicons name="arrow-forward" size={20} color="#111827" />
              </View>
            )}
          </Pressable>
        </>
      )}

      {submitError ? (
        <View style={styles.errorBox}>
          <Ionicons name="warning-outline" size={18} color={colors.error} />
          <Text style={styles.errorText}>{submitError}</Text>
        </View>
      ) : null}

      {(activeQuote?.arrearsPaise ?? 0) > 0 ? (
        <View style={styles.bufferNotice}>
          <Ionicons name="information-circle-outline" size={15} color={colors.brandBrown} />
          <Text style={styles.bufferNoticeText}>
            {`Ride offer ${formatRupeesFromPaise(proposedFarePaise)} + ${formatRupeesFromPaise(activeQuote?.arrearsPaise ?? 0)} previous cancellation fee = ${formatRupeesFromPaise(proposedFarePaise + (activeQuote?.arrearsPaise ?? 0))} estimated total. Payable via Cash or UPI after your trip.`}
          </Text>
        </View>
      ) : null}

      {activeQuote?.bufferApplied ? (
        <View style={styles.bufferNotice}>
          <Ionicons name="information-circle-outline" size={15} color={colors.brandBrown} />
          <Text style={styles.bufferNoticeText}>
            Includes buffer zone surcharge ({activeQuote.cityName || 'City boundary'})
          </Text>
        </View>
      ) : null}

      {activeQuote?.stateBreakdown && activeQuote.stateBreakdown.length > 1 ? (
        <View style={styles.stateBreakdownBox}>
          <Text style={styles.stateBreakdownTitle}>Fare by state</Text>
          {activeQuote.stateBreakdown.map((seg) => (
            <View key={seg.stateCode} style={styles.stateSegmentRow}>
              <Text style={styles.stateSegmentText}>
                {seg.stateName || seg.stateCode} ({seg.distanceKm.toFixed(1)} km)
              </Text>
              {seg.distanceFarePaise ? (
                <Text style={styles.stateSegmentFare}>
                  {formatRupeesFromPaise(seg.distanceFarePaise)}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  const dialogs = (
    <>
      {/* Place Picker Modal */}
      <Modal
        visible={pickerTarget !== null}
        animationType="slide"
        onRequestClose={closePlacePicker}
      >
        <SafeAreaView style={styles.placePickerScreen} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            style={styles.placePickerContent}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.placePickerHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={pickerOnMap ? 'Back to places' : 'Close place picker'}
                onPress={() => (pickerOnMap ? setPickerOnMap(false) : closePlacePicker())}
                style={styles.placePickerBack}
              >
                <Ionicons name="arrow-back" size={24} color={colors.deepBrown} />
              </Pressable>
              <Text style={styles.placePickerTitle} accessibilityRole="header">
                {pickerTarget === 'DROP' ? 'Where to?' : 'Pickup point'}
              </Text>
            </View>

            {pickerTarget === 'DROP' && (
              <Pressable
                style={styles.placePickupRow}
                accessibilityRole="button"
                accessibilityLabel={`Pickup point: ${pickup.address}. Tap to change.`}
                onPress={() => {
                  setPickerTarget('PICKUP');
                  setPlaceSearchQuery('');
                  setAutocompleteResults([]);
                }}
              >
                <RoutePointIcon type="pickup" size={16} />
                <View style={styles.placePickupCopy}>
                  <Text style={styles.placePickupLabel}>PICKUP (TAP TO CHANGE)</Text>
                  <Text style={styles.placePickupAddress} numberOfLines={1}>
                    {pickup.address}
                  </Text>
                </View>
                <View style={styles.placePickupChangeBadge}>
                  <Text style={styles.placePickupChangeText}>Change</Text>
                </View>
              </Pressable>
            )}

            {pickerOnMap ? (
              <>
                <View style={styles.pinMapWrap}>
                  <BookingMap
                    pickup={pickerTarget === 'PICKUP' && pinCandidate ? pinCandidate : pickup}
                    drop={pickerTarget === 'DROP' && pinCandidate ? pinCandidate : undefined}
                    bottomInset={0}
                    interactivePinMode={true}
                    onEditPickup={() => {}}
                    onSelectPoint={(lat, lng) => {
                      setCustomLat(String(lat));
                      setCustomLng(String(lng));
                    }}
                  />
                </View>
                <View style={styles.placePickerFooter}>
                  <Text style={styles.pinHint}>
                    {pinCandidate ? pinCandidate.address : 'Tap the map to place your pin.'}
                  </Text>
                  <Pressable
                    style={[
                      styles.placePrimaryButton,
                      (!pinCandidate || isResolvingPin) && styles.placePrimaryDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      pickerTarget === 'DROP' ? 'Set destination pin' : 'Set pickup pin'
                    }
                    disabled={!pinCandidate || isResolvingPin}
                    onPress={() => void handleApplyCustomCoords()}
                  >
                    {isResolvingPin ? (
                      <ActivityIndicator color={colors.deepBrown} />
                    ) : (
                      <>
                        <Text style={styles.placePrimaryText}>
                          Set {pickerTarget === 'DROP' ? 'destination' : 'pickup'}
                        </Text>
                        <Ionicons name="arrow-forward" size={20} color={colors.deepBrown} />
                      </>
                    )}
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={styles.placeSearchBar}>
                  <Ionicons name="search" size={21} color={colors.secondary} />
                  <TextInput
                    style={styles.placeSearchInput}
                    placeholder="Search address or landmark"
                    placeholderTextColor={colors.muted}
                    value={placeSearchQuery}
                    onChangeText={setPlaceSearchQuery}
                    autoFocus
                    returnKeyType="search"
                    accessibilityLabel="Search places"
                  />
                  {isSearchingPlaces && (
                    <ActivityIndicator size="small" color={colors.brandBrown} />
                  )}
                  {placeSearchQuery.length > 0 && !isSearchingPlaces && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear search"
                      onPress={() => {
                        setPlaceSearchQuery('');
                        setAutocompleteResults([]);
                      }}
                      hitSlop={8}
                      style={styles.placeClearBtn}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.muted} />
                    </Pressable>
                  )}
                </View>
                {pickerTarget === 'PICKUP' && (
                  <Pressable
                    style={styles.gpsActionRow}
                    accessibilityRole="button"
                    onPress={() => void handleUseCurrentGps()}
                    disabled={isLocatingGps}
                  >
                    <Ionicons name="locate" size={20} color={colors.brandBrown} />
                    <Text style={styles.gpsActionText}>
                      {isLocatingGps ? 'Finding your location…' : 'Use current location'}
                    </Text>
                  </Pressable>
                )}
                {pickerTarget === 'PICKUP' && submitError && (
                  <Text style={styles.placeError} accessibilityRole="alert">
                    {submitError}
                  </Text>
                )}
                <ScrollView
                  style={styles.placeResultsScroll}
                  contentContainerStyle={styles.placeResults}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.placeResultsLabel}>
                    {placeSearchQuery.trim()
                      ? autocompleteResults.length > 0
                        ? 'SEARCH RESULTS'
                        : 'MATCHING PLACES'
                      : 'POPULAR PLACES'}
                  </Text>
                  {displayItems.map((item) => (
                    <Pressable
                      key={item.id}
                      style={styles.presetItem}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${item.name}`}
                      onPress={() => void handleSelectSuggestion(item)}
                    >
                      <Ionicons
                        name={
                          'category' in item && item.category === 'AIRPORT'
                            ? 'airplane-outline'
                            : 'location-outline'
                        }
                        size={22}
                        color={colors.brandBrown}
                      />
                      <View style={styles.placeResultCopy}>
                        <Text style={styles.presetTitle} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.presetSub} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    </Pressable>
                  ))}
                  {displayItems.length === 0 && !isSearchingPlaces && (
                    <Text style={styles.placeEmpty}>
                      No matching place. You can choose a point on the map.
                    </Text>
                  )}
                </ScrollView>
                <Pressable
                  style={styles.chooseMapButton}
                  accessibilityRole="button"
                  onPress={() => setPickerOnMap(true)}
                >
                  <Ionicons name="map-outline" size={21} color={colors.deepBrown} />
                  <Text style={styles.chooseMapText}>Choose on map</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.deepBrown} />
                </Pressable>
              </>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Passenger ("For Me" vs "Someone Else") Modal */}
      <Modal
        visible={showPassengerModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowPassengerModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Who is riding?</Text>
              <Pressable onPress={() => setShowPassengerModal(false)}>
                <Ionicons name="close-circle" size={26} color={colors.secondary} />
              </Pressable>
            </View>

            <Pressable
              style={[styles.riderChoiceRow, !forSomeoneElse && styles.riderChoiceRowActive]}
              onPress={() => setForSomeoneElse(false)}
            >
              <Ionicons
                name={!forSomeoneElse ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={colors.deepBrown}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.riderChoiceTitle}>Myself ({profile?.name || 'Me'})</Text>
                <Text style={styles.riderChoiceSub}>{user?.phoneE164 || ''}</Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.riderChoiceRow, forSomeoneElse && styles.riderChoiceRowActive]}
              onPress={() => setForSomeoneElse(true)}
            >
              <Ionicons
                name={forSomeoneElse ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={colors.deepBrown}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.riderChoiceTitle}>Book for someone else</Text>
                <Text style={styles.riderChoiceSub}>
                  Driver will see their name & contact number
                </Text>
              </View>
            </Pressable>

            {forSomeoneElse ? (
              <View style={styles.guestForm}>
                <Text style={styles.inputLabel}>Passenger Full Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Aarav Sharma"
                  placeholderTextColor={colors.muted}
                  value={guestName}
                  onChangeText={setGuestName}
                />

                <Text style={styles.inputLabel}>Passenger Mobile (+91)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="10-digit mobile number"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  maxLength={13}
                  value={guestPhone}
                  onChangeText={setGuestPhone}
                />
              </View>
            ) : null}

            <Pressable style={styles.bookButton} onPress={() => setShowPassengerModal(false)}>
              <Text style={styles.bookButtonText}>Confirm Passenger</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {/* Edit Fare Modal */}
      <Modal
        visible={showEditFareModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowEditFareModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set your fare</Text>
              <Pressable
                onPress={() => setShowEditFareModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={26} color={colors.secondary} />
              </Pressable>
            </View>

         

            <View style={styles.fareInputWrapper}>
              <Text style={styles.fareInputCurrency}>₹</Text>
              <TextInput
                style={styles.fareInputField}
                value={editFareInput}
                onChangeText={handleFareInputChange}
                keyboardType="numeric"
                autoFocus
                maxLength={6}
                placeholder="0"
                placeholderTextColor={colors.muted}
                selectionColor={colors.deepBrown}
              />
            </View>

            {editFareError ? (
              <Text style={styles.fareInlineError}>{editFareError}</Text>
            ) : null}

            {activeQuote &&
            Math.round(proposedFarePaise / 100) !==
              Math.round(activeQuote.suggestedFarePaise / 100) ? (
              <Pressable
                style={styles.resetFareChip}
                onPress={() => {
                  const suggested = String(Math.round(activeQuote.suggestedFarePaise / 100));
                  setEditFareInput(suggested);
                  setEditFareError(null);
                }}
              >
                <Ionicons name="refresh" size={13} color={colors.brandBrown} />
                <Text style={styles.resetFareChipText}>
                  Reset to suggested ({formatRupeesFromPaise(activeQuote.suggestedFarePaise)})
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.modalButtonsRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setShowEditFareModal(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalApplyBtn,
                  (Boolean(editFareError) || !editFareInput) && styles.modalApplyBtnDisabled,
                ]}
                onPress={handleApplyCustomFare}
                disabled={Boolean(editFareError) || !editFareInput}
              >
                <Text style={styles.modalApplyBtnText}>Apply Fare</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );

  if (mode === 'IN_CITY') {
    return (
      <>
        <BookingHome
          pickup={pickup}
          drop={drop}
          bookingStarted={bookingStarted}
          onSearch={() => {
            openPlacePicker('DROP');
          }}
          onEditPickup={() => {
            openPlacePicker('PICKUP');
          }}
          onLocate={() => void handleUseCurrentGps('PICKUP')}
          isLocating={isLocatingGps}
          locationError={submitError}
          templates={modeTemplates}
          onSelectTemplate={(template) => {
            setPickup(template.pickup);
            setDrop(template.drop);
            setBookingStarted(true);
          }}
          activeRide={
            activeRide
              ? {
                  label:
                    activeRide.status === 'PAYMENT_PENDING' ||
                    activeRide.status === 'TRIP_COMPLETED'
                      ? `Pending payment (${formatRupeesFromPaise((activeRide.agreedFarePaise ?? activeRide.proposedFarePaise ?? activeRide.suggestedFarePaise) + (activeRide.arrearsPaise ?? 0))}) · Pay UPI or Confirm Cash`
                      : activeRide.status === 'PAYMENT_UNPAID'
                        ? `Unpaid fare due (${formatRupeesFromPaise((activeRide.agreedFarePaise ?? activeRide.proposedFarePaise ?? activeRide.suggestedFarePaise) + (activeRide.arrearsPaise ?? 0))}) · Tap to resolve`
                        : getRideStatusMeta(activeRide.status).label + ' - View ride',
                  onPress: () => router.push(`/(rider)/ride/${activeRide.id}`),
                }
              : null
          }
          passenger={{
            label: forSomeoneElse && guestName.trim() ? guestName.trim() : 'For me',
            onPress: () => setShowPassengerModal(true),
          }}
          onBack={handleBack}
          topCard={topCard}
          bottomCard={bottomCard}
        />
        {dialogs}
      </>
    );
  }

  return (
    <>
      <BookingHome
        pickup={pickup}
        drop={drop}
        bookingStarted={bookingStarted}
        onSearch={() => {
          openPlacePicker('DROP');
        }}
        onEditPickup={() => {
          openPlacePicker('PICKUP');
        }}
        onLocate={() => void handleUseCurrentGps('PICKUP')}
        isLocating={isLocatingGps}
        locationError={submitError}
        templates={modeTemplates}
        onSelectTemplate={(template) => {
          setPickup(template.pickup);
          setDrop(template.drop);
          setBookingStarted(true);
        }}
        activeRide={
          activeRide
            ? {
                label:
                  activeRide.status === 'PAYMENT_PENDING' ||
                  activeRide.status === 'TRIP_COMPLETED'
                    ? `Pending payment (${formatRupeesFromPaise((activeRide.agreedFarePaise ?? activeRide.proposedFarePaise ?? activeRide.suggestedFarePaise) + (activeRide.arrearsPaise ?? 0))}) · Pay UPI or Confirm Cash`
                    : activeRide.status === 'PAYMENT_UNPAID'
                      ? `Unpaid fare due (${formatRupeesFromPaise((activeRide.agreedFarePaise ?? activeRide.proposedFarePaise ?? activeRide.suggestedFarePaise) + (activeRide.arrearsPaise ?? 0))}) · Tap to resolve`
                      : getRideStatusMeta(activeRide.status).label + ' - View ride',
                onPress: () => router.push(`/(rider)/ride/${activeRide.id}`),
              }
            : null
        }
        passenger={{
          label: forSomeoneElse && guestName.trim() ? guestName.trim() : 'For me',
          onPress: () => setShowPassengerModal(true),
        }}
        onBack={handleBack}
        topCard={topCard}
        bottomCard={bottomCard}
      />
      {dialogs}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 44,
    gap: spacing.md,
  },
  activeRideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.amber,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.brandBrown,
  },
  activeRideBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.deepBrown,
  },
  activeRideBannerTitle: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  activeRideBannerSub: {
    ...typography.caption,
    color: colors.deepBrown,
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectRideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.amber,
    borderRadius: 18,
    height: 58,
    marginTop: spacing.xs,
  },
  selectRideBtnDisabled: {
    opacity: 0.5,
  },
  selectRideBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  selectedRideBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  selectedRideBadgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  selectedRideIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.warmBeige,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedRideBadgeInfo: {
    flex: 1,
    gap: 2,
  },
  selectedRideBadgeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectedRideTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  selectedRideSubtitle: {
    fontSize: 12,
    color: colors.secondary,
  },
  changeRideButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  changeRideButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brandBrown,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  eyebrow: {
    ...typography.label,
    color: colors.brandBrown,
  },
  headerTitle: {
    ...typography.h1,
    color: colors.deepBrown,
  },
  passengerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    maxWidth: 150,
  },
  passengerPillText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  stateBreakdownBox: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 4,
  },
  stateBreakdownTitle: {
    ...typography.label,
    color: colors.brandBrown,
  },
  stateSegmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stateSegmentText: {
    ...typography.caption,
    color: colors.deepBrown,
  },
  stateSegmentFare: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  topCardWrapper: {
    width: '100%',
    paddingHorizontal: 0,
    paddingTop: 0,
    alignItems: 'center',
  },
  topFloatingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    width: '100%',
  },
  topBackBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  topRouteContent: {
    flex: 1,
    paddingHorizontal: 4,
  },
  topLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 26,
  },
  topAddressText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  topConnectorLine: {
    width: 2,
    height: 12,
    backgroundColor: '#059669',
    marginLeft: 7,
    marginVertical: 2,
  },
  topActionsCol: {
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 60,
    paddingLeft: 8,
  },
  topActionIconBtn: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSheetContainer: {
    backgroundColor: '#FAF8F5',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 14,
    elevation: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    width: '100%',
  },
  sheetDragHandle: {
    width: 44,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 12,
  },
  fareHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  fareTitleText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  editFareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  editFareText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#D97706',
  },
  farePillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    marginBottom: 6,
  },
  fareAdjustPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    height: 58,
    paddingHorizontal: 18,
    borderRadius: 18,
    gap: 5,
  },
  fareAdjustSign: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  fareAdjustAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  farePillDisabled: {
    opacity: 0.45,
  },
  fareHeroPill: {
    flex: 1,
    height: 60,
    backgroundColor: '#FBBF24',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fareHeroAmount: {
    fontSize: 34,
    fontWeight: '800',
    color: '#111827',
  },
  tollDisclaimerText: {
    textAlign: 'center',
    fontSize: 13,
    color: '#6B7280',
    marginTop: 10,
    marginBottom: 14,
    fontWeight: '500',
  },
  findCabHeroButton: {
    width: '100%',
    height: 54,
    backgroundColor: '#FBBF24',
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  findCabHeroDisabled: {
    opacity: 0.6,
  },
  findCabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  findCabHeroText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  toastPill: {
    marginTop: 6,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    boxShadow: '0 2px 8px rgba(38, 25, 17, 0.10)',
    elevation: 4,
  },
  toastText: {
    ...typography.caption,
    color: colors.success,
    fontWeight: '700',
  },
  templatesStrip: {
    gap: 6,
  },
  sectionMiniLabel: {
    ...typography.label,
    color: colors.secondary,
  },
  templateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    marginRight: spacing.sm,
  },
  templateChipText: {
    ...typography.caption,
    color: colors.deepBrown,
    fontWeight: '600',
  },
  sectionTitle: {
    ...typography.h2,
    color: colors.deepBrown,
    marginTop: 4,
  },
  vehicleRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  vehicleCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.borderSubtle,
    gap: 4,
  },
  vehicleCardActive: {
    borderColor: colors.deepBrown,
    backgroundColor: colors.cream,
  },
  vehicleCardDisabled: {
    opacity: 0.65,
    backgroundColor: colors.surfaceMuted,
  },
  vehicleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activePill: {
    backgroundColor: colors.warmBeige,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  activePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  comingSoonPill: {
    backgroundColor: colors.borderSubtle,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  comingSoonPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.secondary,
  },
  vehicleTitle: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  vehicleSubtitle: {
    fontSize: 12,
    color: colors.secondary,
  },
  vehicleFareText: {
    ...typography.h2,
    color: colors.deepBrown,
    marginTop: 2,
  },
  bufferNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warningBg,
    padding: spacing.sm,
    borderRadius: radii.sm,
  },
  bufferNoticeText: {
    fontSize: 12,
    color: colors.brandBrown,
    fontWeight: '600',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  loadingText: {
    ...typography.caption,
    color: colors.secondary,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorBg,
    padding: spacing.sm,
    borderRadius: radii.md,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.error,
    fontWeight: '600',
  },
  retryChip: {
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  retryChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
  },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.amber,
    paddingVertical: 16,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
  },
  bookButtonDisabled: {
    opacity: 0.5,
  },
  bookButtonText: {
    ...typography.h2,
    color: colors.deepBrown,
  },

  fareSectionWrap: {
    gap: spacing.sm,
  },
  fareSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  fareSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  editFareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  editFareButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brandBrown,
  },
  unifiedActionBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.amber,
    borderRadius: 18,
    height: 76,
    overflow: 'hidden',
  },
  unifiedActionBarDisabled: {
    opacity: 0.85,
  },
  actionSectionSide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionSectionDisabled: {
    opacity: 0.35,
  },
  actionStepLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.deepBrown,
    marginTop: 2,
  },
  actionBarDivider: {
    width: 1,
    backgroundColor: 'rgba(38, 25, 17, 0.15)',
    marginVertical: 14,
  },
  actionSectionCenter: {
    flex: 1.65,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  findCabContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  findCabTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  findCabTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.deepBrown,
    letterSpacing: -0.2,
  },
  findCabFare: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.deepBrown,
    marginTop: 1,
  },
  submittingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submittingText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  supportingInfoBox: {
    gap: 4,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  supportingTollText: {
    fontSize: 12,
    color: colors.secondary,
    lineHeight: 16,
  },
  supportingPolicyText: {
    fontSize: 11,
    color: colors.secondary,
    lineHeight: 15,
  },
  fareRangeSubtitle: {
    fontSize: 13,
    color: colors.secondary,
  },
  fareInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  fareInputCurrency: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.deepBrown,
    marginRight: 6,
  },
  fareInputField: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.deepBrown,
    minWidth: 120,
    textAlign: 'center',
  },
  fareInlineError: {
    fontSize: 12,
    color: colors.error,
    fontWeight: '600',
    textAlign: 'center',
  },
  resetFareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 5,
    backgroundColor: colors.warmBeige,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  resetFareChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  modalCancelBtnText: {
    ...typography.bodyBold,
    color: colors.secondary,
  },
  modalApplyBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.amber,
  },
  modalApplyBtnDisabled: {
    opacity: 0.45,
  },
  modalApplyBtnText: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  placePickerScreen: { flex: 1, backgroundColor: colors.white },
  placePickerContent: { flex: 1, paddingTop: spacing.sm },
  placePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  placePickerBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placePickerTitle: { ...typography.h1, color: colors.deepBrown },
  placePickupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placePickupCopy: { flex: 1, gap: 2 },
  placePickupLabel: { ...typography.label, color: colors.secondary },
  placePickupAddress: { ...typography.bodyBold, color: colors.deepBrown },
  placePickupChangeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.warningBg,
  },
  placePickupChangeText: {
    ...typography.label,
    color: colors.brandBrown,
  },
  placeSearchBar: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeSearchInput: { flex: 1, fontSize: 17, color: colors.deepBrown },
  placeClearBtn: {
    padding: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeResultsScroll: { flex: 1 },
  placeResults: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  placeResultsLabel: { ...typography.label, color: colors.secondary, marginBottom: spacing.sm },
  placeResultCopy: { flex: 1, gap: 3 },
  placeEmpty: { ...typography.body, color: colors.secondary, paddingVertical: spacing.xl },
  placeError: { ...typography.caption, color: colors.error, marginHorizontal: spacing.lg },
  chooseMapButton: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    margin: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.lightCream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chooseMapText: { ...typography.bodyBold, color: colors.deepBrown, flex: 1 },
  pinMapWrap: { flex: 1, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  placePickerFooter: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.white },
  pinHint: { ...typography.body, color: colors.secondary },
  placePrimaryButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.amber,
    borderRadius: radii.lg,
  },
  placePrimaryDisabled: { opacity: 0.5 },
  placePrimaryText: { ...typography.h2, color: colors.deepBrown },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(58, 36, 20, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    ...typography.h2,
    color: colors.deepBrown,
  },
  gpsActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cream,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gpsActionText: {
    ...typography.bodyBold,
    color: colors.brandBrown,
  },
  presetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 70,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  presetTitle: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  presetSub: {
    fontSize: 12,
    color: colors.secondary,
  },
  riderChoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  riderChoiceRowActive: {
    backgroundColor: colors.cream,
    borderColor: colors.deepBrown,
  },
  riderChoiceTitle: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  riderChoiceSub: {
    ...typography.caption,
    color: colors.secondary,
  },
  guestForm: {
    gap: spacing.xs,
  },
  inputLabel: {
    ...typography.label,
    color: colors.secondary,
    marginTop: 4,
  },
  textInput: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 15,
    color: colors.deepBrown,
  },
});
