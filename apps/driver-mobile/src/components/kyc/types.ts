export interface OnboardingDraft {
  // Flow 2: Vehicle category
  vehicleType: 'CAB' | 'E_RICKSHAW';

  // Flow 5: Step 1 of 6 (Personal Information)
  firstName: string;
  lastName: string;
  dateOfBirth: string; // DD/MM/YYYY
  gender: 'MALE' | 'FEMALE' | 'OTHER' | '';

  // Flow 6: Step 2 of 6 (Where do you drive?)
  city: string;
  isCustomCity?: boolean;

  // Flow 7: Step 3 of 6 (Vehicle details)
  registrationNumber: string; // Indian reg format, e.g. WB74AB1234 (up to 11 chars)
  make: string;
  model: string;
  color: string;
  manufactureYear: number | null;

  // Flow 8: Step 4 of 6 (Driving licence)
  dlNumber: string;
  dlExpiry: string; // DD/MM/YYYY or YYYY-MM-DD
  dlUploaded: boolean;
  govtIdUploaded: boolean;

  // Flow 9: Step 5 of 6 (Vehicle documents)
  rcUploaded: boolean;
  insuranceUploaded: boolean;
  permitUploaded: boolean;

  // Flow 10: Step 6 of 6 (Profile photo)
  selfieTaken: boolean;
  profilePhotoUri?: string;
  profilePhotoDataUrl?: string | null;
}

export const INITIAL_DRAFT: OnboardingDraft = {
  vehicleType: 'CAB',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  city: '',
  isCustomCity: false,
  registrationNumber: '',
  make: '',
  model: '',
  color: '',
  manufactureYear: null,
  dlNumber: '',
  dlExpiry: '',
  dlUploaded: false,
  govtIdUploaded: false,
  rcUploaded: false,
  insuranceUploaded: false,
  permitUploaded: false,
  selfieTaken: false,
};
