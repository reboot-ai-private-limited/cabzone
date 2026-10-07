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

interface StepVehicleDocumentsProps {
  draft: OnboardingDraft;
  onUpdate: (partial: Partial<OnboardingDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepVehicleDocuments({
  draft,
  onUpdate,
  onNext,
  onBack,
}: StepVehicleDocumentsProps) {
  const [rcUploaded, setRcUploaded] = useState<boolean>(draft.rcUploaded ?? true);
  const [insuranceUploaded, setInsuranceUploaded] = useState<boolean>(draft.insuranceUploaded ?? true);

  const handleContinue = () => {
    onUpdate({
      rcUploaded: true,
      insuranceUploaded: true,
    });
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
            <Text style={styles.stepCounterText}>5 of 6</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: '83.3%' }]} />
        </View>

        <Text style={styles.heading}>Vehicle documents</Text>
        <Text style={styles.subheading}>
          We need these documents to verify your vehicle ownership and commercial compliance.
        </Text>

        {/* Document Cards */}
        <View style={styles.docList}>
          {/* Registration Certificate (RC) */}
          <Pressable
            style={[styles.docCard, rcUploaded && styles.docCardDone]}
            onPress={() => setRcUploaded(!rcUploaded)}>
            <View style={styles.docLeft}>
              <View style={[styles.docIconCircle, rcUploaded && styles.docIconCircleDone]}>
                <Text style={styles.docIcon}>{rcUploaded ? '✓' : '📄'}</Text>
              </View>
              <View style={styles.docTextWrap}>
                <Text style={styles.docTitle}>Registration Certificate (RC)</Text>
                <Text style={[styles.docStatus, rcUploaded && styles.docStatusDone]}>
                  {rcUploaded ? '✓ RC uploaded' : '+ Tap to upload RC book / card'}
                </Text>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>

          {/* Vehicle Insurance */}
          <Pressable
            style={[styles.docCard, insuranceUploaded && styles.docCardDone]}
            onPress={() => setInsuranceUploaded(!insuranceUploaded)}>
            <View style={styles.docLeft}>
              <View style={[styles.docIconCircle, insuranceUploaded && styles.docIconCircleDone]}>
                <Text style={styles.docIcon}>{insuranceUploaded ? '✓' : '📄'}</Text>
              </View>
              <View style={styles.docTextWrap}>
                <Text style={styles.docTitle}>Vehicle Insurance</Text>
                <Text style={[styles.docStatus, insuranceUploaded && styles.docStatusDone]}>
                  {insuranceUploaded ? '✓ Insurance policy active' : '+ Tap to upload valid insurance'}
                </Text>
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        <View style={styles.securityBox}>
          <Text style={styles.securityTitle}>🔒 Secure document vault</Text>
          <Text style={styles.securityDesc}>
            All sensitive documents are SHA-256 encrypted and securely stored for regulatory verification in compliance with Motor Vehicles Act.
          </Text>
        </View>

        {/* Next Button */}
        <Pressable
          style={({ pressed }) => [styles.nextBtn, pressed && styles.btnPressed]}
          onPress={handleContinue}>
          <Text style={styles.nextBtnText}>Next →</Text>
        </Pressable>
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
  docList: {
    gap: 14,
    marginBottom: 24,
  },
  docCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  docCardDone: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  docLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  docIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docIconCircleDone: {
    backgroundColor: '#DCFCE7',
  },
  docIcon: {
    fontSize: 18,
    color: '#16A34A',
    fontWeight: '800',
  },
  docTextWrap: {
    flex: 1,
  },
  docTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  docStatus: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  docStatusDone: {
    color: '#15803D',
  },
  chevron: {
    fontSize: 22,
    color: '#9CA3AF',
    fontWeight: '300',
  },
  securityBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 24,
  },
  securityTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  securityDesc: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  nextBtn: {
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
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  nextBtnText: {
    color: '#C8FF00',
    fontSize: 16,
    fontWeight: '800',
  },
});
