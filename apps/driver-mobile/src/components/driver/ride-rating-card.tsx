import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DRIVER_TO_RIDER_RATING_TAGS,
  RIDE_RATING_TAG_LABELS,
  type DriverToRiderRatingTag,
  type RideRatingStatusDto,
} from '@cabzone/contracts';
import { useAuth } from '@/context/auth-context';
import { ridesApi } from '@/services/api';
import { colors, typography } from '@/design-system';

const STAR_OPTIONS = [1, 2, 3, 4, 5] as const;

export interface RideRatingCardProps {
  rideId: string;
  passengerName: string;
  initialStatus?: RideRatingStatusDto | null;
  onUpdated?: ((status: RideRatingStatusDto) => void) | undefined;
}

export function RideRatingCard({
  rideId,
  passengerName,
  initialStatus = null,
  onUpdated,
}: RideRatingCardProps) {
  const { token } = useAuth();
  const [status, setStatus] = useState<RideRatingStatusDto | null>(initialStatus);
  const [loading, setLoading] = useState(!initialStatus && Boolean(token));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stars, setStars] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<DriverToRiderRatingTag[]>([]);
  const [comment, setComment] = useState('');

  const loadStatus = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await ridesApi.getRideRating(token, rideId);
      setStatus(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load rating status.');
    } finally {
      setLoading(false);
    }
  }, [rideId, token]);

  useEffect(() => {
    if (initialStatus || !token) return;
    let cancelled = false;
    ridesApi
      .getRideRating(token, rideId)
      .then((next) => {
        if (!cancelled) {
          setStatus(next);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load rating status.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialStatus, rideId, token]);

  const toggleTag = (tag: DriverToRiderRatingTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
  };

  const handleSubmit = async () => {
    if (!token || stars < 1 || stars > 5 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmedComment = comment.trim();
      const updated = await ridesApi.submitRideRating(token, rideId, {
        stars,
        ...(selectedTags.length > 0 ? { tags: selectedTags } : {}),
        ...(trimmedComment.length > 0 ? { comment: trimmedComment } : {}),
      });
      setStatus(updated);
      onUpdated?.(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not submit passenger rating.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !status) {
    return (
      <View style={styles.card}>
        <View style={styles.inlineRow}>
          <ActivityIndicator size="small" color={colors.deepBrown} />
          <Text style={styles.caption}>Loading rating status…</Text>
        </View>
      </View>
    );
  }

  if (!status) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Passenger Rating</Text>
        {error ? (
          <Text style={styles.errorText} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Pressable
          style={styles.secondaryButton}
          onPress={() => void loadStatus()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading rating status"
        >
          <Text style={styles.secondaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const myReview = status.myReview;
  const counterpartyReview = status.counterpartyReview;

  return (
    <View style={styles.card}>
      {myReview ? (
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{`Your rating for ${passengerName}`}</Text>
            <View
              style={[
                styles.visibilityBadge,
                myReview.status === 'REVEALED' ? styles.revealedBadge : styles.hiddenBadge,
              ]}
            >
              <Text
                style={[
                  styles.visibilityBadgeText,
                  myReview.status === 'REVEALED'
                    ? styles.revealedBadgeText
                    : styles.hiddenBadgeText,
                ]}
              >
                {myReview.status === 'REVEALED' ? 'Published' : 'Private'}
              </Text>
            </View>
          </View>

          <View
            style={styles.recordedStarsRow}
            accessibilityLabel={`You rated ${myReview.stars} out of 5 stars`}
          >
            {STAR_OPTIONS.map((value) => (
              <Ionicons
                key={value}
                name={value <= myReview.stars ? 'star' : 'star-outline'}
                size={20}
                color={value <= myReview.stars ? colors.amber : colors.border}
              />
            ))}
            <Text style={styles.scoreLabel}>{`${myReview.stars}.0`}</Text>
          </View>

          {myReview.tags.length > 0 ? (
            <View style={styles.tagWrap}>
              {myReview.tags.map((tag) => (
                <View key={tag} style={[styles.tagChip, styles.tagChipReadOnly]}>
                  <Text style={styles.tagChipText}>
                    {(RIDE_RATING_TAG_LABELS as Record<string, string>)[tag] ?? tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {myReview.comment ? <Text style={styles.commentQuote}>{myReview.comment}</Text> : null}

          <Text style={styles.caption}>
            {myReview.status === 'REVEALED'
              ? 'Visible to both participants and counted toward rider trust.'
              : `Stays private until ${passengerName} submits a rating or 7 days pass after settlement.`}
          </Text>
        </View>
      ) : status.canSubmit ? (
        <View style={styles.section}>
          <Text style={styles.title}>{`Rate ${passengerName}`}</Text>
          <Text style={styles.caption}>
            Stays private until both of you submit or 7 days pass.
          </Text>

          <View style={styles.starRow}>
            {STAR_OPTIONS.map((value) => {
              const selected = value <= stars;
              return (
                <Pressable
                  key={value}
                  style={styles.starButton}
                  onPress={() => setStars(value)}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel={`Rate ${value} out of 5 stars`}
                  accessibilityState={{ selected: stars === value, disabled: submitting }}
                >
                  <Ionicons
                    name={selected ? 'star' : 'star-outline'}
                    size={30}
                    color={selected ? colors.amber : colors.border}
                  />
                </Pressable>
              );
            })}
          </View>

          {stars > 0 ? (
            <>
              <View style={styles.tagWrap}>
                {DRIVER_TO_RIDER_RATING_TAGS.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <Pressable
                      key={tag}
                      style={[styles.tagChip, active && styles.tagChipSelected]}
                      onPress={() => toggleTag(tag)}
                      disabled={submitting}
                      accessibilityRole="button"
                      accessibilityLabel={RIDE_RATING_TAG_LABELS[tag]}
                      accessibilityState={{ selected: active, disabled: submitting }}
                    >
                      <Text
                        style={[styles.tagChipText, active && styles.tagChipTextSelected]}
                      >
                        {RIDE_RATING_TAG_LABELS[tag]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                style={styles.noteInput}
                value={comment}
                onChangeText={setComment}
                placeholder="Optional note about the trip (max 280 chars)"
                placeholderTextColor={colors.secondary}
                maxLength={280}
                multiline
                editable={!submitting}
                accessibilityLabel="Optional note about the trip"
              />
            </>
          ) : null}

          {error ? (
            <Text style={styles.errorText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          <Pressable
            style={[
              styles.submitButton,
              (stars < 1 || submitting) && styles.submitButtonDisabled,
            ]}
            onPress={() => void handleSubmit()}
            disabled={stars < 1 || submitting}
            accessibilityRole="button"
            accessibilityLabel="Submit rating"
            accessibilityState={{ disabled: stars < 1 || submitting, busy: submitting }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.deepBrown} />
            ) : (
              <Text style={styles.submitButtonText}>Submit rating</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.title}>Rating window closed</Text>
          <Text style={styles.caption}>
            Ratings close 7 days after payment settlement.
          </Text>
        </View>
      )}

      {counterpartyReview ? (
        <View style={[styles.section, styles.counterpartySection]}>
          <Text style={styles.counterpartyTitle}>{`Rating from ${passengerName}`}</Text>
          <View
            style={styles.recordedStarsRow}
            accessibilityLabel={`${passengerName} rated you ${counterpartyReview.stars} out of 5 stars`}
          >
            {STAR_OPTIONS.map((value) => (
              <Ionicons
                key={value}
                name={value <= counterpartyReview.stars ? 'star' : 'star-outline'}
                size={18}
                color={value <= counterpartyReview.stars ? colors.amber : colors.border}
              />
            ))}
            <Text style={styles.scoreLabel}>{`${counterpartyReview.stars}.0`}</Text>
          </View>
          {counterpartyReview.tags.length > 0 ? (
            <View style={styles.tagWrap}>
              {counterpartyReview.tags.map((tag) => (
                <View key={tag} style={[styles.tagChip, styles.tagChipReadOnly]}>
                  <Text style={styles.tagChipText}>
                    {(RIDE_RATING_TAG_LABELS as Record<string, string>)[tag] ?? tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {counterpartyReview.comment ? (
            <Text style={styles.commentQuote}>{counterpartyReview.comment}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  section: {
    gap: 12,
  },
  counterpartySection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: typography.sizes.base,
    fontWeight: '800',
    color: colors.deepBrown,
    flex: 1,
  },
  counterpartyTitle: {
    fontSize: typography.sizes.label,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  caption: {
    fontSize: typography.sizes.xs,
    fontWeight: '500',
    color: colors.secondary,
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordedStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreLabel: {
    fontSize: typography.sizes.label,
    fontWeight: '800',
    color: colors.deepBrown,
    marginLeft: 4,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  tagChipSelected: {
    borderColor: colors.deepBrown,
    backgroundColor: colors.softAmber,
  },
  tagChipReadOnly: {
    minHeight: 32,
    paddingVertical: 4,
  },
  tagChipText: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.deepBrown,
  },
  tagChipTextSelected: {
    fontWeight: '800',
  },
  noteInput: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: typography.sizes.sm,
    color: colors.deepBrown,
    textAlignVertical: 'top',
  },
  commentQuote: {
    fontSize: typography.sizes.sm,
    fontWeight: '500',
    color: colors.deepBrown,
  },
  visibilityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  hiddenBadge: {
    backgroundColor: colors.softAmber,
  },
  revealedBadge: {
    backgroundColor: '#DCFCE7',
  },
  visibilityBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  hiddenBadgeText: {
    color: colors.brandBrown,
  },
  revealedBadgeText: {
    color: colors.success,
  },
  submitButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitButtonText: {
    fontSize: typography.sizes.label,
    fontWeight: '800',
    color: colors.deepBrown,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: typography.sizes.label,
    fontWeight: '700',
    color: colors.deepBrown,
  },
  errorText: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.error,
  },
});
