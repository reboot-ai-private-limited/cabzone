import React, { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { useAuth } from '@/context/auth-context';
import { driverApi } from '@/services/api';
import {
  getServerDocumentStatus,
  isValidRegistrationNumber,
  normalizeRegistrationNumber,
  personalInfoPayload,
  toBackendDate,
  toDisplayDate,
} from '@/services/profile';
import { clearKycDraft, getKycDraft, saveKycDraft } from '@/services/storage';
import { INITIAL_DRAFT, type OnboardingDraft } from './types';
import { StepPersonalInfo } from './step-personal-info';
import { StepOperatingCity } from './step-operating-city';
import { StepVehicleInfo } from './step-vehicle-info';
import { StepDrivingLicence } from './step-driving-licence';
import { StepVehicleDocuments } from './step-vehicle-documents';
import { StepProfilePhoto } from './step-profile-photo';
import { StepReview } from './step-review';
import { StepSubmitted } from './step-submitted';

export function KycWizard() {
  const { user, token, driver, vehicle, documents, refreshProfile, logout } = useAuth();

  const [draft, setDraft] = useState<OnboardingDraft>(() => ({
    ...INITIAL_DRAFT,
    firstName: driver?.name?.split(' ')[0] || '',
    lastName: driver?.name?.split(' ').slice(1).join(' ') || '',
    dateOfBirth: toDisplayDate(driver?.dateOfBirth || ''),
    gender:
      driver?.gender === 'MALE' || driver?.gender === 'FEMALE' || driver?.gender === 'OTHER'
        ? driver.gender
        : '',
    profilePhotoUri: driver?.profilePhotoUrl || undefined,
    selfieTaken: Boolean(driver?.profilePhotoUrl),
    dlNumber: driver?.dlNumber || '',
    dlExpiry: toDisplayDate(
      documents.find((document) => document.type === 'DRIVING_LICENSE')?.expiresAt?.slice(0, 10) ||
        driver?.dlExpiry ||
        '',
    ),
    dlUploaded: getServerDocumentStatus(documents, 'DRIVING_LICENSE').status === 'READY',
    govtIdUploaded: getServerDocumentStatus(documents, 'GOVERNMENT_ID').status === 'READY',
    rcUploaded: getServerDocumentStatus(documents, 'REGISTRATION_CERTIFICATE').status === 'READY',
    insuranceUploaded: getServerDocumentStatus(documents, 'INSURANCE').status === 'READY',
    permitUploaded: getServerDocumentStatus(documents, 'PERMIT').status === 'READY',
    city: driver?.address || '',
    vehicleType: vehicle?.vehicleType || 'CAB',
    registrationNumber: vehicle?.registrationNumber || '',
    make: vehicle?.make || '',
    model: vehicle?.model || '',
    color: vehicle?.color || '',
    manufactureYear: vehicle?.manufactureYear ?? null,
  }));

  const [step, setStep] = useState<number>(1);
  const hydratedForUserRef = useRef<string | null>(null);

  const goToStep = (nextStep: number) => {
    Keyboard.dismiss();
    setStep(nextStep);
  };

  // Hydrate non-sensitive local draft for current user and reconcile with authoritative server state (F03)
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    let cancelled = false;
    void (async () => {
      const persisted = await getKycDraft(userId);
      if (cancelled) return;

      const serverFirstName = driver?.name?.split(' ')[0] || '';
      const serverLastName = driver?.name?.split(' ').slice(1).join(' ') || '';
      const serverDob = toDisplayDate(driver?.dateOfBirth || '');
      const serverGender =
        driver?.gender === 'MALE' || driver?.gender === 'FEMALE' || driver?.gender === 'OTHER'
          ? driver.gender
          : '';
      const serverDlExpiry = toDisplayDate(
        documents.find((doc) => doc.type === 'DRIVING_LICENSE')?.expiresAt?.slice(0, 10) ||
          driver?.dlExpiry ||
          '',
      );

      setDraft((prev) => ({
        ...prev,
        firstName: serverFirstName || persisted?.firstName || prev.firstName || '',
        lastName: serverFirstName ? serverLastName : (persisted?.lastName ?? prev.lastName ?? ''),
        dateOfBirth: serverDob || persisted?.dateOfBirth || prev.dateOfBirth || '',
        gender: serverGender || persisted?.gender || prev.gender || '',
        profilePhotoUri: driver?.profilePhotoUrl || prev.profilePhotoUri || undefined,
        selfieTaken: Boolean(driver?.profilePhotoUrl || prev.selfieTaken),
        dlNumber: driver?.dlNumber || persisted?.dlNumber || prev.dlNumber || '',
        dlExpiry: serverDlExpiry || persisted?.dlExpiry || prev.dlExpiry || '',
        dlUploaded: getServerDocumentStatus(documents, 'DRIVING_LICENSE').status === 'READY',
        govtIdUploaded: getServerDocumentStatus(documents, 'GOVERNMENT_ID').status === 'READY',
        rcUploaded:
          getServerDocumentStatus(documents, 'REGISTRATION_CERTIFICATE').status === 'READY',
        insuranceUploaded: getServerDocumentStatus(documents, 'INSURANCE').status === 'READY',
        permitUploaded: getServerDocumentStatus(documents, 'PERMIT').status === 'READY',
        city: driver?.address || persisted?.city || prev.city || '',
        isCustomCity: persisted?.isCustomCity ?? prev.isCustomCity,
        vehicleType: vehicle?.vehicleType || persisted?.vehicleType || prev.vehicleType || 'CAB',
        registrationNumber:
          vehicle?.registrationNumber ||
          persisted?.registrationNumber ||
          prev.registrationNumber ||
          '',
        make: vehicle?.make || persisted?.make || prev.make || '',
        model: vehicle?.model || persisted?.model || prev.model || '',
        color: vehicle?.color || persisted?.color || prev.color || '',
        manufactureYear:
          vehicle?.manufactureYear ??
          persisted?.manufactureYear ??
          prev.manufactureYear ??
          null,
      }));

      if (hydratedForUserRef.current !== userId) {
        hydratedForUserRef.current = userId;
        if (persisted?.step && persisted.step >= 1 && persisted.step <= 7) {
          setStep(persisted.step);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, driver, vehicle, documents]);

  // Persist non-sensitive draft and active step on changes (F03), debounced to avoid blocking typing
  useEffect(() => {
    const userId = user?.id;
    if (!userId || step === 8 || hydratedForUserRef.current !== userId) return;

    const timer = setTimeout(() => {
      void saveKycDraft(userId, {
        step,
        vehicleType: draft.vehicleType,
        firstName: draft.firstName,
        lastName: draft.lastName,
        dateOfBirth: draft.dateOfBirth,
        gender: draft.gender,
        city: draft.city,
        isCustomCity: draft.isCustomCity,
        registrationNumber: draft.registrationNumber,
        make: draft.make,
        model: draft.model,
        color: draft.color,
        manufactureYear: draft.manufactureYear,
        dlNumber: draft.dlNumber,
        dlExpiry: draft.dlExpiry,
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [user?.id, step, draft]);

  const updateDraft = (partial: Partial<OnboardingDraft>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  };

  const savePersonalInfo = async (values: OnboardingDraft) => {
    if (!token) throw new Error('Please sign in before saving your profile.');
    const saved = await driverApi.saveProfile(token, personalInfoPayload(values));
    setDraft({
      ...values,
      profilePhotoUri: saved.profilePhotoUrl || undefined,
      profilePhotoDataUrl: undefined,
    });
    await refreshProfile();
    goToStep(2);
  };

  const handleSubmitApplication = async () => {
    if (!token) throw new Error('Please sign in before submitting your application.');
    if (!draft.gender) {
      throw new Error('Please select your gender in Step 1.');
    }
    if (!draft.city.trim()) {
      throw new Error('Please select your operating city in Step 2.');
    }

    const normalizedReg = normalizeRegistrationNumber(
      vehicle?.registrationNumber || draft.registrationNumber,
    );
    if (!isValidRegistrationNumber(normalizedReg)) {
      throw new Error('Please enter a valid vehicle registration number in Step 3.');
    }

    // 1. Save / Update Driver Profile (including operating city as address)
    await driverApi.saveProfile(token, {
      name: `${draft.firstName} ${draft.lastName}`.trim(),
      gender: draft.gender,
      dateOfBirth: toBackendDate(draft.dateOfBirth),
      address: draft.city.trim(),
      dlNumber: (driver?.dlNumber || draft.dlNumber).trim(),
    });

    // 2. Ensure application exists in DRAFT
    await driverApi.createApplication(token);

    // 3. Register Vehicle only if not already registered with matching details
    const vehicleAlreadyMatches =
      vehicle &&
      driver?.currentVehicleId &&
      vehicle.registrationNumber === normalizedReg &&
      vehicle.make === (draft.make || vehicle.make) &&
      vehicle.model === (draft.model || vehicle.model) &&
      vehicle.color === (draft.color || vehicle.color) &&
      (vehicle.manufactureYear ?? null) === (draft.manufactureYear ?? null);

    if (!vehicleAlreadyMatches) {
      await driverApi.registerVehicle(token, {
        vehicleType: draft.vehicleType,
        make: (draft.make || vehicle?.make || '').trim(),
        model: (draft.model || vehicle?.model || '').trim(),
        registrationNumber: normalizedReg,
        color: (draft.color || vehicle?.color || '').trim(),
        manufactureYear: draft.manufactureYear ?? null,
      });
    }

    // 4. Submit the application for review
    await driverApi.submitApplication(token);

    // 5. Clear local onboarding draft and immediately advance to confirmation screen (F03, F18)
    await clearKycDraft(user?.id);
    goToStep(8);

    // 6. Refresh authoritative profile in background without blocking confirmation
    void refreshProfile().catch(() => {});
  };

  switch (step) {
    case 1:
      return (
        <StepPersonalInfo
          draft={draft}
          onUpdate={updateDraft}
          onNext={savePersonalInfo}
          onClose={logout}
        />
      );
    case 2:
      return (
        <StepOperatingCity
          draft={draft}
          onUpdate={updateDraft}
          onNext={() => goToStep(3)}
          onBack={() => goToStep(1)}
        />
      );
    case 3:
      return (
        <StepVehicleInfo
          draft={draft}
          onUpdate={updateDraft}
          onNext={() => goToStep(4)}
          onBack={() => goToStep(2)}
        />
      );
    case 4:
      return (
        <StepDrivingLicence
          draft={draft}
          onUpdate={updateDraft}
          onNext={() => goToStep(5)}
          onBack={() => goToStep(3)}
        />
      );
    case 5:
      return (
        <StepVehicleDocuments
          draft={draft}
          onUpdate={updateDraft}
          onNext={() => goToStep(6)}
          onBack={() => goToStep(4)}
        />
      );
    case 6:
      return (
        <StepProfilePhoto
          draft={draft}
          onUpdate={updateDraft}
          onNext={() => goToStep(7)}
          onBack={() => goToStep(5)}
        />
      );
    case 7:
      return (
        <StepReview
          draft={draft}
          onEditStep={(s) => goToStep(s)}
          onSubmit={handleSubmitApplication}
          onBack={() => goToStep(6)}
        />
      );
    case 8:
      return <StepSubmitted onGoHome={() => refreshProfile()} />;
    default:
      return null;
  }
}
