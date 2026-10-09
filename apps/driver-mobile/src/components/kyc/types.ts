export interface OnboardingDraft {
  // Flow 2: Vehicle category
  vehicleType: 'CAB' | 'E_RICKSHAW';

  // Flow 5: Step 1 of 6 (Personal Information)
  firstName: string;
  lastName: string;
  dateOfBirth: string; // DD/MM/YYYY
  gender: 'MALE' | 'FEMALE' | 'OTHER';

  // Flow 6: Step 2 of 6 (Where do you drive?)
  city: string;

  // Flow 7: Step 3 of 6 (Vehicle details)
  registrationNumber: string; // Indian reg format, e.g. WB74AB1234
  make: string;
  model: string;
  color: string;
  manufactureYear: number;

  // Flow 8: Step 4 of 6 (Driving licence)
  dlNumber: string;
  dlUploaded: boolean;

  // Flow 9: Step 5 of 6 (Vehicle documents)
  rcUploaded: boolean;
  insuranceUploaded: boolean;

  // Flow 10: Step 6 of 6 (Selfie / Profile photo)
  selfieTaken: boolean;
  profilePhotoUri?: string;
}

export const INITIAL_DRAFT: OnboardingDraft = {
  vehicleType: 'CAB',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: 'MALE',
  city: 'Siliguri',
  registrationNumber: '',
  make: 'Maruti Suzuki',
  model: 'Dzire Tour',
  color: 'White',
  manufactureYear: 2022,
  dlNumber: '',
  dlUploaded: false,
  rcUploaded: false,
  insuranceUploaded: false,
  selfieTaken: false,
};
