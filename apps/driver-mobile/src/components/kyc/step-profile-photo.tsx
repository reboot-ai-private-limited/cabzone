import React, { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { OnboardingDraft } from './types';

interface StepProfilePhotoProps {
  draft: OnboardingDraft;
  onUpdate: (partial: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepProfilePhoto({
  draft,
  onUpdate,
  onNext,
  onBack,
}: StepProfilePhotoProps) {
  const [photoTaken, setPhotoTaken] = useState(draft.selfieTaken || false);

  const handleTakePhoto = () => {
    setPhotoTaken(true);
  };

  const handleRetake = () => {
    setPhotoTaken(false);
  };

  const handleContinue = () => {
    onUpdate({ selfieTaken: true });
    onNext();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Top row */}
        <View style={styles.topRow}>
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <View style={styles.stepCounterBadge}>
            <Text style={styles.stepCounterText}>6 of 6</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: '100%' }]} />
        </View>

        <Text style={styles.heading}>Take your profile photo</Text>
        <Text style={styles.subheading}>
          Your live selfie helps riders identify you at pickup and builds trust.
        </Text>

        {/* Camera / Frame View */}
        <View style={styles.cameraFrameBox}>
          <View style={[styles.avatarOval, photoTaken && styles.avatarOvalSuccess]}>
            <Text style={styles.avatarFace}>{photoTaken ? '👨‍✈️' : '👤'}</Text>
            {photoTaken ? (
              <View style={styles.verifiedCheckBadge}>
                <Text style={styles.verifiedCheckText}>✓</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.frameLabel}>
            {photoTaken ? '✓ Selfie Captured' : 'Position your face within the frame'}
          </Text>
        </View>

        {/* Quality Checklist */}
        <View style={styles.checklistCard}>
          <Text style={styles.checklistTitle}>Selfie tips for quick approval:</Text>
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
        {!photoTaken ? (
          <Pressable
            style={({ pressed }) => [styles.captureBtn, pressed && styles.btnPressed]}
            onPress={handleTakePhoto}>
            <Text style={styles.captureBtnText}>📷 Take Photo</Text>
          </Pressable>
        ) : (
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.retakeBtn, pressed && styles.btnPressed]}
              onPress={handleRetake}>
              <Text style={styles.retakeBtnText}>Retake</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.usePhotoBtn, pressed && styles.btnPressed]}
              onPress={handleContinue}>
              <Text style={styles.usePhotoBtnText}>Review Application →</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  backArrow: {
    fontSize: 18,
    color: '#111827',
    fontWeight: '700',
  },
  stepCounterBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  stepCounterText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4B5563',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginBottom: 28,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#002451',
    borderRadius: 3,
  },
  heading: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  subheading: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 24,
  },
  cameraFrameBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    marginBottom: 24,
  },
  avatarOval: {
    width: 120,
    height: 150,
    borderRadius: 60,
    backgroundColor: '#F3F4F6',
    borderWidth: 3,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  avatarOvalSuccess: {
    borderColor: '#10B981',
    borderStyle: 'solid',
    backgroundColor: '#ECFDF5',
  },
  avatarFace: {
    fontSize: 64,
  },
  verifiedCheckBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  verifiedCheckText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  frameLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  checklistCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 24,
    gap: 10,
  },
  checklistTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkIcon: {
    fontSize: 14,
    fontWeight: '900',
    color: '#16A34A',
  },
  checkText: {
    fontSize: 13,
    color: '#4B5563',
  },
  captureBtn: {
    backgroundColor: '#002451',
    borderRadius: 18,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#002451',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  captureBtnText: {
    color: '#C8FF00',
    fontSize: 16,
    fontWeight: '800',
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
    borderColor: '#E5E7EB',
  },
  retakeBtnText: {
    color: '#4B5563',
    fontSize: 15,
    fontWeight: '700',
  },
  usePhotoBtn: {
    flex: 2,
    backgroundColor: '#002451',
    borderRadius: 18,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#002451',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  usePhotoBtnText: {
    color: '#C8FF00',
    fontSize: 15,
    fontWeight: '800',
  },
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
});
