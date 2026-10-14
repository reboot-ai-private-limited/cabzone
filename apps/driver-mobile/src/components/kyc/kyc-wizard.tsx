import React, { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { driverApi } from '@/services/api';
import { personalInfoPayload, toBackendDate, toDisplayDate } from '@/services/profile';
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
  const { token, driver, vehicle, documents, refreshProfile, logout } = useAuth();

  const [draft, setDraft] = useState<OnboardingDraft>(() => ({
    ...INITIAL_DRAFT,
    firstName: driver?.name?.split(' ')[0] || '',
    lastName: driver?.name?.split(' ').slice(1).join(' ') || '',
    dateOfBirth: toDisplayDate(driver?.dateOfBirth || ''),
    gender: driver?.gender === 'FEMALE' || driver?.gender === 'OTHER' ? driver.gender : 'MALE',
    profilePhotoUri: driver?.profilePhotoUrl || undefined,
    selfieTaken: Boolean(driver?.profilePhotoUrl),
    dlNumber: driver?.dlNumber || '',
    dlExpiry: documents.find((document) => document.type === 'DRIVING_LICENSE')?.expiresAt?.slice(0, 10) || driver?.dlExpiry || '',
    dlUploaded: documents.some((document) => document.type === 'DRIVING_LICENSE' && !document.storageKey.startsWith('mock/')),
    govtIdUploaded: documents.some((document) => document.type === 'GOVERNMENT_ID' && !document.storageKey.startsWith('mock/')),
    rcUploaded: documents.some((document) => document.type === 'REGISTRATION_CERTIFICATE' && !document.storageKey.startsWith('mock/')),
    insuranceUploaded: documents.some((document) => document.type === 'INSURANCE' && !document.storageKey.startsWith('mock/')),
    permitUploaded: documents.some((document) => document.type === 'PERMIT' && !document.storageKey.startsWith('mock/')),
    city: driver?.address || 'Siliguri',
    vehicleType: vehicle?.vehicleType || 'CAB',
    registrationNumber: vehicle?.registrationNumber || '',
    make: vehicle?.make || INITIAL_DRAFT.make,
    model: vehicle?.model || 'Maruti Dzire Tour',
    color: vehicle?.color || 'White',
  }));

  const [step, setStep] = useState<number>(1);

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
    setStep(2);
  };

  const handleSubmitApplication = async () => {
    if (!token) return;

    // 1. Save / Update Driver Profile
    await driverApi.saveProfile(token, {
      name: `${draft.firstName} ${draft.lastName}`.trim(),
      gender: draft.gender,
      dateOfBirth: toBackendDate(draft.dateOfBirth),
      address: draft.city,
      dlNumber: draft.dlNumber,
    });

    // 2. Ensure application exists in DRAFT
    await driverApi.createApplication(token);

    // 3. Register Vehicle
    await driverApi.registerVehicle(token, {
      vehicleType: draft.vehicleType,
      make: draft.make,
      model: draft.model,
      registrationNumber: draft.registrationNumber || 'WB74AB1234',
      color: draft.color,
      manufactureYear: draft.manufactureYear,
    });

    // 4. Submit the documents already uploaded during onboarding for review.
    await driverApi.submitApplication(token);

    // 5. Refresh authoritative profile from backend
    await refreshProfile();

    // 6. Advance to Flow 12 (Application Submitted)
    setStep(8);
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
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      );
    case 3:
      return (
        <StepVehicleInfo
          draft={draft}
          onUpdate={updateDraft}
          onNext={() => setStep(4)}
          onBack={() => setStep(2)}
        />
      );
    case 4:
      return (
        <StepDrivingLicence
          draft={draft}
          onUpdate={updateDraft}
          onNext={() => setStep(5)}
          onBack={() => setStep(3)}
        />
      );
    case 5:
      return (
        <StepVehicleDocuments
          draft={draft}
          onUpdate={updateDraft}
          onNext={() => setStep(6)}
          onBack={() => setStep(4)}
        />
      );
    case 6:
      return (
        <StepProfilePhoto
          draft={draft}
          onUpdate={updateDraft}
          onNext={() => setStep(7)}
          onBack={() => setStep(5)}
        />
      );
    case 7:
      return (
        <StepReview
          draft={draft}
          onEditStep={(s) => setStep(s)}
          onSubmit={handleSubmitApplication}
          onBack={() => setStep(6)}
        />
      );
    case 8:
      return <StepSubmitted onGoHome={() => refreshProfile()} />;
    default:
      return null;
  }
}
