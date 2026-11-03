import React from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RoutePointIcon } from '@/components/common/route-point-icon';
import { colors, radii, spacing, typography } from '@/design-system';

export type PickerField = { kind: 'PICKUP' } | { kind: 'DROP' } | { kind: 'STOP'; index: number };

export interface PickerPlace {
  id: string;
  name: string;
  subtitle: string;
  lat?: number | undefined;
  lng?: number | undefined;
}

interface DropPlacePickerProps {
  visible: boolean;
  field: PickerField;
  pickupLabel: string;
  dropLabel: string | null;
  stopLabels: (string | null)[];
  maxStops: number;
  query: string;
  onQueryChange: (text: string) => void;
  isSearching: boolean;
  isLocating: boolean;
  /** Search results (or popular places when the query is empty). */
  results: PickerPlace[];
  resultsLabel: string;
  saved: PickerPlace[];
  recents: PickerPlace[];
  isSaved: (place: PickerPlace) => boolean;
  errorText: string | null;
  onFocusField: (field: PickerField) => void;
  onAddStop: () => void;
  onRemoveStop: (index: number) => void;
  onSelectPlace: (place: PickerPlace) => void;
  onToggleSaved: (place: PickerPlace) => void;
  onSelectOnMap: () => void;
  onUseCurrentLocation: () => void;
  onClose: () => void;
}

function fieldTitle(field: PickerField): string {
  return field.kind === 'PICKUP' ? 'Pickup' : field.kind === 'STOP' ? 'Add stop' : 'Drop';
}

export function DropPlacePicker(props: DropPlacePickerProps) {
  const {
    field,
    pickupLabel,
    dropLabel,
    stopLabels,
    maxStops,
    query,
    isSearching,
    isLocating,
    results,
    resultsLabel,
    saved,
    recents,
    errorText,
  } = props;
  const isActive = (candidate: PickerField) =>
    candidate.kind === field.kind &&
    (candidate.kind !== 'STOP' || (field.kind === 'STOP' && field.index === candidate.index));
  const canAddStop = props.dropLabel !== null && stopLabels.length < maxStops && field.kind !== 'STOP';
  const searching = query.trim().length >= 2;

  const renderRow = (place: PickerPlace, icon: 'time-outline' | 'location-outline' | 'heart') => {
    const saved = props.isSaved(place);
    return (
      <Pressable
        key={`${icon}-${place.id}`}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={`Select ${place.name}`}
        onPress={() => props.onSelectPlace(place)}
      >
        <Ionicons name={icon} size={22} color={colors.secondary} style={styles.rowIcon} />
        <View style={styles.rowCopy}>
          <Text style={styles.rowName} numberOfLines={1}>
            {place.name}
          </Text>
          {place.subtitle ? (
            <Text style={styles.rowAddress} numberOfLines={1}>
              {place.subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={saved ? `Remove ${place.name} from saved places` : `Save ${place.name}`}
          accessibilityState={{ selected: saved }}
          onPress={() => props.onToggleSaved(place)}
        >
          <Ionicons
            name={saved ? 'heart' : 'heart-outline'}
            size={26}
            color={saved ? colors.error : colors.muted}
          />
        </Pressable>
      </Pressable>
    );
  };

  const inputRow = (candidate: PickerField, label: string | null, dot: React.ReactNode) => {
    const active = isActive(candidate);
    return (
      <View style={styles.fieldRow}>
        <View style={styles.dotCol}>{dot}</View>
        {active ? (
          <View style={styles.fieldInputWrap}>
            <TextInput
              style={styles.fieldInput}
              placeholder={label ?? (candidate.kind === 'PICKUP' ? 'Pickup location' : 'Search address or landmark')}
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={props.onQueryChange}
              autoFocus
              selectTextOnFocus
              returnKeyType="search"
              accessibilityLabel={`${fieldTitle(candidate)} search`}
            />
            {isSearching ? (
              <ActivityIndicator size="small" color={colors.brandBrown} />
            ) : query.length > 0 ? (
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => props.onQueryChange('')}
              >
                <Ionicons name="close-circle-outline" size={22} color={colors.secondary} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Pressable
            style={styles.fieldInputWrap}
            accessibilityRole="button"
            accessibilityLabel={`${fieldTitle(candidate)}: ${label ?? 'not set'}. Tap to change.`}
            onPress={() => props.onFocusField(candidate)}
          >
            <Text style={styles.fieldText} numberOfLines={1}>
              {label ?? 'Choose a place'}
            </Text>
            {candidate.kind === 'STOP' ? (
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Remove stop"
                onPress={() => props.onRemoveStop(candidate.index)}
              >
                <Ionicons name="close-circle-outline" size={22} color={colors.secondary} />
              </Pressable>
            ) : null}
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close place picker"
              onPress={props.onClose}
              hitSlop={10}
            >
              <Ionicons name="arrow-back" size={26} color={colors.deepBrown} />
            </Pressable>
            <Text style={styles.title} accessibilityRole="header">
              {fieldTitle(field)}
            </Text>
          </View>

          <View style={styles.routeCard}>
            {inputRow({ kind: 'PICKUP' }, pickupLabel, <RoutePointIcon type="pickup" size={16} />)}
            {stopLabels.map((label, index) => (
              <React.Fragment key={`stop-${index}`}>
                <View style={styles.divider} />
                {inputRow({ kind: 'STOP', index }, label, <View style={styles.stopDot} />)}
              </React.Fragment>
            ))}
            <View style={styles.divider} />
            {inputRow({ kind: 'DROP' }, dropLabel, <RoutePointIcon type="drop" size={16} />)}
          </View>

          <View style={styles.pills}>
            <Pressable
              style={styles.pill}
              accessibilityRole="button"
              onPress={props.onSelectOnMap}
            >
              <Ionicons name="location-outline" size={22} color={colors.deepBrown} />
              <Text style={styles.pillText}>Select on map</Text>
            </Pressable>
            {field.kind === 'PICKUP' ? (
              <Pressable
                style={styles.pill}
                accessibilityRole="button"
                disabled={isLocating}
                onPress={props.onUseCurrentLocation}
              >
                <Ionicons name="locate" size={22} color={colors.deepBrown} />
                <Text style={styles.pillText}>{isLocating ? 'Locating…' : 'Current location'}</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.pill, !canAddStop && styles.pillDisabled]}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAddStop }}
                disabled={!canAddStop}
                onPress={props.onAddStop}
              >
                <Ionicons name="add-circle" size={24} color={colors.deepBrown} />
                <Text style={styles.pillText}>
                  Add stops{stopLabels.length ? ` (${stopLabels.length}/${maxStops})` : ''}
                </Text>
              </Pressable>
            )}
          </View>
          {field.kind !== 'PICKUP' && !props.dropLabel ? (
            <Text style={styles.hint}>Choose your drop first, then add stops along the way.</Text>
          ) : null}
          {errorText ? (
            <Text style={styles.error} accessibilityRole="alert">
              {errorText}
            </Text>
          ) : null}

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
          >
            {searching ? (
              <>
                <Text style={styles.sectionLabel}>{resultsLabel}</Text>
                {results.map((place) => renderRow(place, 'location-outline'))}
                {results.length === 0 && !isSearching ? (
                  <Text style={styles.empty}>No matching place. Try Select on map.</Text>
                ) : null}
              </>
            ) : (
              <>
                {saved.length > 0 ? (
                  <>
                    <Text style={styles.sectionLabel}>SAVED PLACES</Text>
                    {saved.map((place) => renderRow(place, 'heart'))}
                  </>
                ) : null}
                {recents.length > 0 ? (
                  <>
                    <Text style={styles.sectionLabel}>RECENT</Text>
                    {recents.map((place) => renderRow(place, 'time-outline'))}
                  </>
                ) : null}
                {results.length > 0 ? (
                  <>
                    <Text style={styles.sectionLabel}>{resultsLabel}</Text>
                    {results.map((place) => renderRow(place, 'location-outline'))}
                  </>
                ) : null}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { ...typography.h1, color: colors.deepBrown },
  routeCard: {
    marginHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: spacing.md },
  dotCol: { width: 20, alignItems: 'center' },
  stopDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: colors.brandBrown,
  },
  fieldInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
  },
  fieldInput: { flex: 1, ...typography.body, color: colors.deepBrown, paddingVertical: 0 },
  fieldText: { flex: 1, ...typography.body, color: colors.deepBrown },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 20 + spacing.md },
  pills: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
  },
  pillDisabled: { opacity: 0.45 },
  pillText: { ...typography.bodyBold, color: colors.deepBrown },
  hint: { ...typography.caption, color: colors.secondary, paddingHorizontal: spacing.lg },
  error: { ...typography.caption, color: colors.error, paddingHorizontal: spacing.lg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  sectionLabel: {
    ...typography.caption,
    color: colors.secondary,
    fontWeight: '700',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    borderStyle: 'dashed',
  },
  rowIcon: { width: 26 },
  rowCopy: { flex: 1, gap: 2 },
  rowName: { ...typography.bodyBold, color: colors.deepBrown },
  rowAddress: { ...typography.caption, color: colors.secondary },
  empty: { ...typography.body, color: colors.secondary, paddingVertical: spacing.lg },
});
