import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router';
import { BookingHome } from './booking-home';
import BookingMap from './booking-map';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import type { QuoteDto, VehicleCategory } from '@cabzone/contracts';
import { colors, radii, spacing, typography } from '@/design-system';
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
  const { token, user, profile, templates, addTemplate, preferences } = useAuth();
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
  const [customFareInput, setCustomFareInput] = useState<string>('');
  const [isEditingFare, setIsEditingFare] = useState(false);

  // Submitting ride
  const [isSubmittingRide, setIsSubmittingRide] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [templateSavedToast, setTemplateSavedToast] = useState<string | null>(null);
  const pendingBookingAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const submittingRideRef = useRef(false);

  const openPlacePicker = (target: 'PICKUP' | 'DROP') => {
    setPickerTarget(target);
    setPickerOnMap(false);
    setPlaceSearchQuery('');
    setCustomLat('');
    setCustomLng('');
    setSubmitError(null);
  };

  const closePlacePicker = () => {
    setPickerTarget(null);
    setPickerOnMap(false);
  };

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
  const fetchQuotes = useCallback(async () => {
    if (mode === 'IN_CITY' && !bookingStarted) return;
    if (Math.abs(pickup.lat - drop.lat) < 0.0001 && Math.abs(pickup.lng - drop.lng) < 0.0001) {
      setQuoteError('Pickup and drop locations must be different.');
      setQuotes([]);
      return;
    }

    setIsLoadingQuote(true);
    setQuoteError(null);
    setSubmitError(null);
    try {
      const response = await geoAndPricingApi.createQuote(token, {
        pickup: { lat: pickup.lat, lng: pickup.lng },
        drop: { lat: drop.lat, lng: drop.lng },
        vehicleCategory: selectedCategory,
      });
      setQuotes([response]);
      const fare = preferredFareRef.current === null
        ? response.suggestedFarePaise
        : clampProposedFarePaise(preferredFareRef.current, response.negotiation.floorPaise, response.negotiation.ceilingPaise);
      preferredFareRef.current = null;
      setProposedFarePaise(fare);
      setCustomFareInput(String(Math.round(fare / 100)));
    } catch (err: unknown) {
      setQuotes([]);
      setQuoteError(
        err instanceof Error ? err.message : 'Unable to calculate fare quote for this route.',
      );
    } finally {
      setIsLoadingQuote(false);
    }
  }, [drop.lat, drop.lng, pickup.lat, pickup.lng, token, mode, bookingStarted, selectedCategory]);

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
    setCustomFareInput(String(Math.round(next / 100)));
  };

  const handleCommitCustomFare = () => {
    setIsEditingFare(false);
    if (!activeQuote) return;
    const rupees = Number(customFareInput.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setCustomFareInput(String(Math.round(proposedFarePaise / 100)));
      return;
    }
    const clamped = clampProposedFarePaise(
      rupees * 100,
      activeQuote.negotiation.floorPaise,
      activeQuote.negotiation.ceilingPaise,
    );
    setProposedFarePaise(clamped);
    setCustomFareInput(String(Math.round(clamped / 100)));
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
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = Number(pos.coords.latitude.toFixed(5));
      const lng = Number(pos.coords.longitude.toFixed(5));
      let address = `GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
      try {
        const resolved = await geoAndPricingApi.reverseGeocode(token, lat, lng);
        if (resolved.formattedAddress) {
          address = resolved.formattedAddress;
        } else if (resolved.city) {
          address = `${resolved.city}${resolved.state ? `, ${resolved.state}` : ''}`;
        }
      } catch {
        // fallback to coordinates label
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

  const handleSelectPreset = (preset: PlacePreset) => {
    const loc: LocationSelection = {
      lat: preset.lat,
      lng: preset.lng,
      address: preset.name,
    };
    if (pickerTarget === 'DROP') {
      setBookingStarted(true);
      setDrop(loc);
    } else {
      setPickup(loc);
    }
    closePlacePicker();
    setPlaceSearchQuery('');
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
    let address = `Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    try {
      const resolved = await geoAndPricingApi.reverseGeocode(token, lat, lng);
      address = resolved.formattedAddress || [resolved.city, resolved.state].filter(Boolean).join(', ') || address;
    } catch {
      // Keep coordinates if lookup is unavailable.
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

  const handleSaveCurrentAsTemplate = async () => {
    const label = `${pickup.address.split(',')[0]} → ${drop.address.split(',')[0]}`;
    await addTemplate({
      label,
      mode,
      pickup,
      drop,
    });
    setTemplateSavedToast('Saved to your Route Templates');
    setTimeout(() => setTemplateSavedToast(null), 2600);
  };

  const handleBookRide = async () => {
    if (!activeQuote || activeRide || isSubmittingRide || submittingRideRef.current) return;
    setSubmitError(null);

    let passengerName = profile?.name?.trim() || 'Cabzone Rider';
    let passengerPhone = user?.phoneE164 || '+919876543210';

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

  const pinCandidate: LocationSelection | null =
    customLat !== '' && customLng !== ''
      ? {
          lat: Number(customLat),
          lng: Number(customLng),
          address: `Pin (${Number(customLat).toFixed(4)}, ${Number(customLng).toFixed(4)})`,
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

  const bookingForm = (
    <>
      {/* Pickup & Drop Selector Card */}
      <View style={styles.routeCard}>
        <View style={styles.routeInputsCol}>
          <Pressable
            style={styles.locationRow}
            onPress={() => {
              openPlacePicker('PICKUP');
            }}
          >
            <View style={[styles.dotIndicator, { backgroundColor: colors.success }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationLabel}>PICKUP LOCATION</Text>
              <Text style={styles.locationValue} numberOfLines={1}>
                {pickup.address}
              </Text>
            </View>
            <Ionicons name="search-outline" size={18} color={colors.secondary} />
          </Pressable>

          <View style={styles.routeDivider} />

          <Pressable
            style={styles.locationRow}
            onPress={() => {
              openPlacePicker('DROP');
            }}
          >
            <View style={[styles.dotIndicator, { backgroundColor: colors.brandBrown }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationLabel}>DROP-OFF DESTINATION</Text>
              <Text style={styles.locationValue} numberOfLines={1}>
                {drop.address}
              </Text>
            </View>
            <Ionicons name="search-outline" size={18} color={colors.secondary} />
          </Pressable>
        </View>

        <Pressable
          style={styles.swapButton}
          onPress={handleSwapLocations}
          accessibilityLabel="Swap pickup and drop locations"
        >
          <Ionicons name="swap-vertical" size={20} color={colors.deepBrown} />
        </Pressable>
      </View>

      {/* Gate / Landmark Note + Save Route Template Row */}
      <View style={styles.noteAndTemplateRow}>
        <View style={styles.noteInputWrap}>
          <Ionicons name="location-outline" size={16} color={colors.secondary} />
          <TextInput
            style={styles.noteInput}
            placeholder="Gate, apartment, or landmark note (optional)"
            placeholderTextColor={colors.muted}
            value={locationNote}
            onChangeText={setLocationNote}
          />
        </View>
        <Pressable style={styles.saveTemplateBtn} onPress={handleSaveCurrentAsTemplate}>
          <Ionicons name="bookmark-outline" size={16} color={colors.deepBrown} />
          <Text style={styles.saveTemplateBtnText}>Save</Text>
        </Pressable>
      </View>

      {templateSavedToast ? <Text style={styles.toastText}>✓ {templateSavedToast}</Text> : null}

      {/* Saved Templates Quick Bar */}
      {modeTemplates.length > 0 ? (
        <View style={styles.templatesStrip}>
          <Text style={styles.sectionMiniLabel}>Saved routes</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {modeTemplates.map((tpl) => (
              <Pressable
                key={tpl.id}
                style={styles.templateChip}
                onPress={() => {
                  setPickup(tpl.pickup);
                  setDrop(tpl.drop);
                  setBookingStarted(true);
                }}
              >
                <Ionicons name="flash-outline" size={13} color={colors.brandBrown} />
                <Text style={styles.templateChipText} numberOfLines={1}>
                  {tpl.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Vehicle Class Selector (CAB Active, E_RICKSHAW Coming soon) */}
      <Text style={styles.sectionTitle}>Choose a ride</Text>
      <View style={styles.vehicleRow}>
        <Pressable
          style={[styles.vehicleCard, selectedCategory === 'CAB' && styles.vehicleCardActive]}
          onPress={() => setSelectedCategory('CAB')}
        >
          <View style={styles.vehicleCardHeader}>
            <Ionicons name="car-sport" size={24} color={colors.deepBrown} />
            <View style={styles.activePill}>
              <Text style={styles.activePillText}>4 Seats</Text>
            </View>
          </View>
          <Text style={styles.vehicleTitle}>Cabzone Cab</Text>
          <Text style={styles.vehicleSubtitle}>
            {mode === 'OUTSTATION' ? 'AC Highway & Hills Cab' : 'AC Hatchback / Sedan'}
          </Text>
          <Text style={styles.vehicleFareText}>
            {activeQuote
              ? formatRupeesFromPaise(activeQuote.suggestedFarePaise)
              : isLoadingQuote
                ? 'Calculating...'
                : '--'}
          </Text>
        </Pressable>

        <View style={[styles.vehicleCard, styles.vehicleCardDisabled]}>
          <View style={styles.vehicleCardHeader}>
            <Ionicons name="bicycle" size={24} color={colors.muted} />
            <View style={styles.comingSoonPill}>
              <Text style={styles.comingSoonPillText}>SOON</Text>
            </View>
          </View>
          <Text style={[styles.vehicleTitle, { color: colors.secondary }]}>E-Rickshaw</Text>
          <Text style={styles.vehicleSubtitle}>Short city hops only</Text>
          <Text style={[styles.vehicleFareText, { color: colors.muted }]}>Coming soon</Text>
        </View>
      </View>

      {/* Negotiable Fare Card */}
      <View style={styles.fareCard}>
        <View style={styles.fareHeaderRow}>
          <View>
            <Text style={styles.fareCardLabel}>Your fare</Text>
            <Text style={styles.fareCardSub}>
              {activeQuote
                ? `Allowed range: ${formatRupeesFromPaise(activeQuote.negotiation.floorPaise)} – ${formatRupeesFromPaise(activeQuote.negotiation.ceilingPaise)}`
                : 'Choose pickup and destination'}
            </Text>
          </View>
          {activeQuote && proposedFarePaise !== activeQuote.suggestedFarePaise ? (
            <Pressable
              style={styles.resetSuggestedChip}
              onPress={() => {
                setProposedFarePaise(activeQuote.suggestedFarePaise);
                setCustomFareInput(String(Math.round(activeQuote.suggestedFarePaise / 100)));
              }}
            >
              <Text style={styles.resetSuggestedText}>
                Reset ({formatRupeesFromPaise(activeQuote.suggestedFarePaise)})
              </Text>
            </Pressable>
          ) : null}
        </View>

        {isLoadingQuote ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.deepBrown} />
            <Text style={styles.loadingText}>Getting your fare...</Text>
          </View>
        ) : quoteError ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errorText}>{quoteError}</Text>
            <Pressable style={styles.retryChip} onPress={() => void fetchQuotes()}>
              <Text style={styles.retryChipText}>Retry</Text>
            </Pressable>
          </View>
        ) : activeQuote ? (
          <>
            <View style={styles.stepperRow}>
              <Pressable
                style={[
                  styles.stepperBtn,
                  proposedFarePaise <= activeQuote.negotiation.floorPaise &&
                    styles.stepperBtnDisabled,
                ]}
                onPress={() => handleAdjustFare(-1000)}
                disabled={proposedFarePaise <= activeQuote.negotiation.floorPaise}
                accessibilityRole="button"
                accessibilityLabel="Decrease fare offer by 10 rupees"
                accessibilityState={{
                  disabled: proposedFarePaise <= activeQuote.negotiation.floorPaise,
                }}
              >
                <Text style={styles.stepperBtnText}>− ₹10</Text>
              </Pressable>

              <Pressable
                style={styles.fareDisplayCenter}
                onPress={() => setIsEditingFare(true)}
                accessibilityRole="button"
                accessibilityLabel={`Proposed fare ${formatRupeesFromPaise(proposedFarePaise)}, tap to edit`}
              >
                {isEditingFare ? (
                  <TextInput
                    style={styles.fareNumericInput}
                    value={customFareInput}
                    onChangeText={setCustomFareInput}
                    keyboardType="numeric"
                    autoFocus
                    onBlur={handleCommitCustomFare}
                    onSubmitEditing={handleCommitCustomFare}
                  />
                ) : (
                  <>
                    <Text style={styles.proposedFareBig}>
                      {formatRupeesFromPaise(proposedFarePaise)}
                    </Text>
                    <Text style={styles.tapToEditHint}>Edit fare</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={[
                  styles.stepperBtn,
                  proposedFarePaise >= activeQuote.negotiation.ceilingPaise &&
                    styles.stepperBtnDisabled,
                ]}
                onPress={() => handleAdjustFare(1000)}
                disabled={proposedFarePaise >= activeQuote.negotiation.ceilingPaise}
                accessibilityRole="button"
                accessibilityLabel="Increase fare offer by 10 rupees"
                accessibilityState={{
                  disabled: proposedFarePaise >= activeQuote.negotiation.ceilingPaise,
                }}
              >
                <Text style={styles.stepperBtnText}>+ ₹10</Text>
              </Pressable>
            </View>

            {(activeQuote.arrearsPaise ?? 0) > 0 ? (
              <View style={styles.bufferNotice}>
                <Ionicons name="information-circle-outline" size={15} color={colors.brandBrown} />
                <Text style={styles.bufferNoticeText}>
                  {`Ride offer ${formatRupeesFromPaise(proposedFarePaise)} + ${formatRupeesFromPaise(activeQuote.arrearsPaise ?? 0)} previous cancellation fee = ${formatRupeesFromPaise(proposedFarePaise + (activeQuote.arrearsPaise ?? 0))} estimated total.`}
                  {activeQuote.cashAllowed === false
                    ? ' Cash payment is unavailable until cancellation arrears are cleared — pay via UPI after trip.'
                    : ''}
                </Text>
              </View>
            ) : null}
            {activeQuote.bufferApplied ? (
              <View style={styles.bufferNotice}>
                <Ionicons name="information-circle-outline" size={15} color={colors.brandBrown} />
                <Text style={styles.bufferNoticeText}>
                  Includes buffer zone surcharge ({activeQuote.cityName || 'City boundary'})
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      {submitError ? (
        <View style={styles.errorBox}>
          <Ionicons name="warning-outline" size={18} color={colors.error} />
          <Text style={styles.errorText}>{submitError}</Text>
        </View>
      ) : null}

      {activeQuote ? (
        <Text style={styles.fareCardSub}>
          Free cancellation while searching or within grace period after assignment; standard fee
          applies later or after driver arrival.
        </Text>
      ) : null}

      {/* Primary Book Ride CTA */}
      <Pressable
        style={[
          styles.bookButton,
          (!activeQuote || activeRide || isLoadingQuote || isSubmittingRide) &&
            styles.bookButtonDisabled,
        ]}
        onPress={() => void handleBookRide()}
        disabled={!activeQuote || !!activeRide || isLoadingQuote || isSubmittingRide}
        accessibilityRole="button"
        accessibilityLabel={
          activeQuote
            ? `Find ${selectedCategory === 'CAB' ? 'Cab' : 'Ride'} for ${formatRupeesFromPaise(proposedFarePaise)}`
            : 'Find Ride'
        }
        accessibilityState={{
          disabled: !activeQuote || !!activeRide || isLoadingQuote || isSubmittingRide,
          busy: isSubmittingRide,
        }}
      >
        {isSubmittingRide ? (
          <ActivityIndicator color={colors.deepBrown} />
        ) : (
          <>
            <Text style={styles.bookButtonText}>
              Find {selectedCategory === 'CAB' ? 'Cab' : 'Ride'} ·{' '}
              {activeQuote ? formatRupeesFromPaise(proposedFarePaise) : '--'}
            </Text>
            <Ionicons name="arrow-forward" size={20} color={colors.deepBrown} />
          </>
        )}
      </Pressable>
    </>
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
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
              <View style={styles.placePickupRow}>
                <Ionicons name="ellipse" size={13} color={colors.success} />
                <View style={styles.placePickupCopy}>
                  <Text style={styles.placePickupLabel}>PICKUP</Text>
                  <Text style={styles.placePickupAddress} numberOfLines={1}>
                    {pickup.address}
                  </Text>
                </View>
              </View>
            )}

            {pickerOnMap ? (
              <>
                <View style={styles.pinMapWrap}>
                  <BookingMap
                    pickup={pickerTarget === 'PICKUP' && pinCandidate ? pinCandidate : pickup}
                    drop={pickerTarget === 'DROP' && pinCandidate ? pinCandidate : undefined}
                    bottomInset={0}
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
                    {isResolvingPin ? <ActivityIndicator color={colors.deepBrown} /> : (
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
                    placeholder="Search popular places"
                    placeholderTextColor={colors.muted}
                    value={placeSearchQuery}
                    onChangeText={setPlaceSearchQuery}
                    autoFocus
                    returnKeyType="search"
                  />
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
                    {placeSearchQuery.trim() ? 'MATCHING PLACES' : 'POPULAR PLACES'}
                  </Text>
                  {filteredPresets.map((item) => (
                    <Pressable
                      key={item.id}
                      style={styles.presetItem}
                      accessibilityRole="button"
                      onPress={() => handleSelectPreset(item)}
                    >
                      <Ionicons
                        name={item.category === 'AIRPORT' ? 'airplane-outline' : 'location-outline'}
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
                  {filteredPresets.length === 0 && (
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
                  label: getRideStatusMeta(activeRide.status).label + ' - View ride',
                  onPress: () => router.push(`/(rider)/ride/${activeRide.id}`),
                }
              : null
          }
          passenger={{
            label: forSomeoneElse && guestName.trim() ? guestName.trim() : 'For me',
            onPress: () => setShowPassengerModal(true),
          }}
        >
          {bookingForm}
        </BookingHome>
        {dialogs}
      </>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Active Ride Recovery Banner */}
      {activeRide ? (
        <Pressable
          style={styles.activeRideBanner}
          onPress={() => router.push(`/(rider)/ride/${activeRide.id}`)}
        >
          <View style={styles.activeRideBannerLeft}>
            <View style={styles.pulseDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.activeRideBannerTitle}>
                Active Ride · {getRideStatusMeta(activeRide.status).label}
              </Text>
              <Text style={styles.activeRideBannerSub} numberOfLines={1}>
                {activeRide.pickupOtp
                  ? `Pickup OTP: ${activeRide.pickupOtp} · Tap to open live trip`
                  : 'Tap to view live driver status & counter-offers'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.deepBrown} />
        </Pressable>
      ) : null}

      {/* Header & Passenger Selector Pill */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>
            {mode === 'OUTSTATION'
              ? 'INTERCITY · OUTSTATION'
              : `${preferences.operationalCity.toUpperCase()} · IN-CITY`}
          </Text>
          <Text style={styles.headerTitle}>
            {mode === 'OUTSTATION' ? 'City-to-City Rides' : 'Where are you going?'}
          </Text>
        </View>

        <Pressable style={styles.passengerPill} onPress={() => setShowPassengerModal(true)}>
          <Ionicons name="person-circle-outline" size={18} color={colors.deepBrown} />
          <Text style={styles.passengerPillText} numberOfLines={1}>
            {forSomeoneElse && guestName.trim() ? guestName.trim() : 'For Me'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.secondary} />
        </Pressable>
      </View>

      {/* Visual Route Canvas Card */}
      <View style={styles.mapCanvasCard}>
        <View style={styles.mapCanvasTopRow}>
          <View style={styles.classificationBadge}>
            <Ionicons
              name={mode === 'OUTSTATION' ? 'trail-sign-outline' : 'navigate-circle-outline'}
              size={14}
              color={colors.deepBrown}
            />
            <Text style={styles.classificationBadgeText}>
              {activeQuote
                ? `${activeQuote.serviceType}${activeQuote.routeScope === 'INTERSTATE' ? ' · INTERSTATE' : ''}`
                : mode === 'OUTSTATION'
                  ? 'OUTSTATION'
                  : 'IN-CITY'}
            </Text>
          </View>
          {activeQuote ? (
            <Text style={styles.mapMetricsText}>
              {formattedDistance} · ~{formattedDuration}
            </Text>
          ) : null}
        </View>

        {/* Visual Route Line between Pickup and Drop */}
        <View style={styles.visualRouteTrack}>
          <View style={styles.visualNode}>
            <View style={[styles.visualPin, { backgroundColor: colors.success }]} />
            <Text style={styles.visualNodeName} numberOfLines={1}>
              {pickup.address.split(',')[0]}
            </Text>
            <Text style={styles.visualNodeCoord}>
              {pickup.lat.toFixed(3)}, {pickup.lng.toFixed(3)}
            </Text>
          </View>

          <View style={styles.visualRouteConnector}>
            <View style={styles.visualDashedLine} />
            <View style={styles.visualCarBadge}>
              <Ionicons name="car-sport" size={16} color={colors.deepBrown} />
            </View>
            <View style={styles.visualDashedLine} />
          </View>

          <View style={[styles.visualNode, { alignItems: 'flex-end' }]}>
            <View style={[styles.visualPin, { backgroundColor: colors.brandBrown }]} />
            <Text style={styles.visualNodeName} numberOfLines={1}>
              {drop.address.split(',')[0]}
            </Text>
            <Text style={styles.visualNodeCoord}>
              {drop.lat.toFixed(3)}, {drop.lng.toFixed(3)}
            </Text>
          </View>
        </View>

        {/* Interstate Segment Breakdown if applicable */}
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

      {bookingForm}
      {dialogs}
    </ScrollView>
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
  mapCanvasCard: {
    backgroundColor: colors.cream,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  mapCanvasTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  classificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.warmBeige,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  classificationBadgeText: {
    ...typography.label,
    color: colors.deepBrown,
  },
  mapMetricsText: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  visualRouteTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  visualNode: {
    flex: 1,
    gap: 2,
  },
  visualPin: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 2,
  },
  visualNodeName: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  visualNodeCoord: {
    fontSize: 11,
    color: colors.secondary,
  },
  visualRouteConnector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  visualDashedLine: {
    width: 24,
    height: 2,
    backgroundColor: colors.softAmber,
  },
  visualCarBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
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
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  routeInputsCol: {
    flex: 1,
    gap: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dotIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondary,
    letterSpacing: 0.4,
  },
  locationValue: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  routeDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginLeft: 18,
  },
  swapButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteAndTemplateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  noteInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  noteInput: {
    flex: 1,
    fontSize: 13,
    color: colors.deepBrown,
  },
  saveTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  saveTemplateBtnText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.deepBrown,
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
  fareCard: {
    backgroundColor: colors.cream,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: spacing.md,
  },
  fareHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  fareCardLabel: {
    ...typography.label,
    color: colors.brandBrown,
  },
  fareCardSub: {
    ...typography.caption,
    color: colors.secondary,
  },
  resetSuggestedChip: {
    backgroundColor: colors.warmBeige,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  resetSuggestedText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  stepperBtn: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.deepBrown,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  stepperBtnDisabled: {
    opacity: 0.35,
  },
  stepperBtnText: {
    ...typography.bodyBold,
    color: colors.deepBrown,
  },
  fareDisplayCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proposedFareBig: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  tapToEditHint: {
    fontSize: 11,
    color: colors.secondary,
  },
  fareNumericInput: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.deepBrown,
    borderBottomWidth: 2,
    borderBottomColor: colors.deepBrown,
    minWidth: 100,
    textAlign: 'center',
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
