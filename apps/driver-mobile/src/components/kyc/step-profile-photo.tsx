import { colors, typography, createStyles } from '@/design-system';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';
import { driverApi } from '@/services/api';
import { pickProfilePhoto } from '@/services/profile-photo';
import type { OnboardingDraft } from './types';

interface StepProfilePhotoProps {
  draft: OnboardingDraft;
  onUpdate: (partial: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepProfilePhoto({ draft, onUpdate, onNext, onBack }: StepProfilePhotoProps) {
  const insets = useSafeAreaInsets();
  const { token, driver, refreshProfile } = useAuth();
  const [photoUri, setPhotoUri] = useState(draft.profilePhotoUri || driver?.profilePhotoUrl || undefined);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(draft.profilePhotoDataUrl ?? undefined);
  const [isSaving, setIsSaving] = useState(false);

  const hasPhoto = Boolean(photoUri);
  const isSavedOnServer = Boolean(driver?.profilePhotoUrl) && !photoDataUrl;

  const handleChoosePhoto = (useCamera: boolean) => async () => {
    try {
      const photo = await pickProfilePhoto(useCamera);
      if (photo) {
        setPhotoUri(photo.uri);
        setPhotoDataUrl(photo.dataUrl);
      }
    } catch (err) {
      Alert.alert('Photo unavailable', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handlePromptSource = () => {
    Alert.alert('Profile photo', 'Choose how you would like to add your profile photo.', [
      { text: 'Take Photo', onPress: () => void handleChoosePhoto(true)() },
      { text: 'Choose from Gallery', onPress: () => void handleChoosePhoto(false)() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleContinue = async () => {
    if (!photoUri || !token || isSaving) return;
    setIsSaving(true);
    try {
      let storedUrl = photoUri;
      if (photoDataUrl) {
        const saved = await driverApi.saveProfile(token, { profilePhotoDataUrl: photoDataUrl });
        storedUrl = saved.profilePhotoUrl || photoUri;
        setPhotoDataUrl(undefined);
        await refreshProfile();
      }
      onUpdate({
        selfieTaken: true,
        profilePhotoUri: storedUrl,
        profilePhotoDataUrl: undefined,
      });
      onNext();
    } catch (err) {
      Alert.alert(
        'Could not save photo',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 24) + 20,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* Top row */}
        <View style={styles.topRow}>
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.backBtn, pressed && styles.btnPressed]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={20} color="#172B3A" />
          </Pressable>
          <View style={styles.stepBadge}>
            <View style={styles.stepDot} />
            <Text style={styles.stepBadgeText}>Step 6 of 6</Text>
          </View>
        </View>

        {/* 6-Step Segmented Progress Bar */}
        <View style={styles.progressContainer}>
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <View key={s} style={[styles.progressSegment, styles.progressSegmentActive]} />
          ))}
        </View>

        <Text style={styles.heading}>Profile photo</Text>
        <Text style={styles.subheading}>
          Your profile photo helps riders recognize you at pickup and is reviewed during onboarding.
        </Text>

        {/* Camera / Frame View */}
        <View style={styles.cameraFrameBox}>
          <View
            style={[
              styles.avatarOval,
              hasPhoto && (isSavedOnServer ? styles.avatarOvalSuccess : styles.avatarOvalPending),
            ]}>
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={{ width: '100%', height: '100%', borderRadius: 100 }}
              />
            ) : (
              <Ionicons name="person-outline" size={56} color="#53616C" />
            )}
            {hasPhoto ? (
              <View
                style={[
                  styles.statusBadge,
                  isSavedOnServer ? styles.statusBadgeSaved : styles.statusBadgePending,
                ]}>
                <Ionicons
                  name={isSavedOnServer ? 'checkmark' : 'cloud-upload-outline'}
                  size={16}
                  color="#FFFFFF"
                />
              </View>
            ) : null}
          </View>
          <Text style={styles.frameLabel}>
            {!hasPhoto
              ? 'Add a clear, front-facing photo of yourself'
              : isSavedOnServer
                ? 'Photo saved for review'
                : 'Photo selected · Tap Save & Review to upload'}
          </Text>
        </View>

        {/* Quality Checklist */}
        <View style={styles.checklistCard}>
          <Text style={styles.checklistTitle}>Photo guidelines for quick approval:</Text>
          <View style={styles.checkItem}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.checkText}>Face clearly visible and centered</Text>
          </View>
          <View style={styles.checkItem}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.checkText}>Good ambient lighting, plain background</Text>
          </View>
          <View style={styles.checkItem}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.checkText}>No sunglasses or dark tinted spectacles</Text>
          </View>
          <View style={styles.checkItem}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.checkText}>No caps, helmet, or face covering</Text>
          </View>
        </View>

        {/* Capture / Actions */}
        {!hasPhoto ? (
          <View style={styles.captureOptionsCol}>
            <Pressable
              style={({ pressed }) => [styles.captureBtn, pressed && styles.btnPressed]}
              onPress={() => void handleChoosePhoto(true)()}
              accessibilityRole="button"
              accessibilityLabel="Take profile photo with camera">
              <Ionicons name="camera-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.captureBtnText}>Take Photo</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.galleryBtn, pressed && styles.btnPressed]}
              onPress={() => void handleChoosePhoto(false)()}
              accessibilityRole="button"
              accessibilityLabel="Choose profile photo from gallery">
              <Ionicons name="images-outline" size={18} color="#172B3A" style={{ marginRight: 8 }} />
              <Text style={styles.galleryBtnText}>Choose from Gallery</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.retakeBtn, pressed && styles.btnPressed]}
              onPress={handlePromptSource}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel="Replace profile photo">
              <Text style={styles.retakeBtnText}>Replace</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.usePhotoBtn, pressed && styles.btnPressed]}
              onPress={() => void handleContinue()}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel={
                photoDataUrl ? 'Save photo and review application' : 'Continue to review application'
              }>
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.usePhotoBtnText}>
                  {photoDataUrl ? 'Save & Review →' : 'Review Application →'}
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = createStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.lightBlue,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.darkNavy,
    marginRight: 6,
  },
  stepBadgeText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.darkNavy,
  },
  progressContainer: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 22,
  },
  progressSegment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
  progressSegmentActive: {
    backgroundColor: colors.darkNavy,
  },
  heading: {
    fontSize: typography.sizes.xxl,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
    letterSpacing: -0.6,
    lineHeight: 33,
  },
  subheading: {
    fontSize: typography.sizes.label,
    color: colors.secondary,
    lineHeight: 20,
    marginBottom: 24,
    fontWeight: '500',
  },
  cameraFrameBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: 24,
  },
  avatarOval: {
    width: 128,
    height: 156,
    borderRadius: 64,
    backgroundColor: colors.lightBlue,
    borderWidth: 3,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  avatarOvalSuccess: {
    borderColor: '#16A34A',
    borderStyle: 'solid',
    backgroundColor: '#ECFDF5',
  },
  avatarOvalPending: {
    borderColor: '#D97706',
    borderStyle: 'solid',
    backgroundColor: '#FFFBEB',
  },
  statusBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  statusBadgeSaved: {
    backgroundColor: '#16A34A',
  },
  statusBadgePending: {
    backgroundColor: '#D97706',
  },
  frameLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.secondary,
    textAlign: 'center',
  },
  checklistCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.2,
    borderColor: '#FDE68A',
    marginBottom: 24,
    gap: 10,
  },
  checklistTitle: {
    fontSize: typography.sizes.label,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 2,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkIcon: {
    fontSize: typography.sizes.label,
    fontWeight: '800',
    color: '#15803D',
  },
  checkText: {
    fontSize: typography.sizes.sm,
    color: colors.secondary,
    fontWeight: '500',
  },
  captureOptionsCol: {
    gap: 12,
  },
  captureBtn: {
    flexDirection: 'row',
    backgroundColor: colors.darkNavy,
    borderRadius: 18,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  captureBtnText: {
    color: colors.white,
    fontSize: typography.sizes.base,
    fontWeight: '800',
  },
  galleryBtn: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  galleryBtnText: {
    color: colors.text,
    fontSize: typography.sizes.base,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  retakeBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  retakeBtnText: {
    color: colors.text,
    fontSize: typography.sizes.base,
    fontWeight: '700',
  },
  usePhotoBtn: {
    flex: 2,
    backgroundColor: colors.darkNavy,
    borderRadius: 18,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.darkNavy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  usePhotoBtnText: {
    color: colors.white,
    fontSize: typography.sizes.base,
    fontWeight: '800',
  },
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
}));
