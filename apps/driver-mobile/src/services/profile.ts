import type {
  DocumentType,
  DriverDocumentDto,
  DriverDto,
  SaveDriverProfileRequestDto,
  VehicleDto,
} from '@cabzone/contracts';
import type { OnboardingDraft } from '../components/kyc/types.ts';

export const MIN_DOB_YEAR = 1950;
export const MIN_VEHICLE_YEAR = 2000;
export const MAX_VEHICLE_REG_LENGTH = 11;
export const VEHICLE_REG_PATTERN = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;

export function getMaxDobYear(now: Date = new Date()): number {
  return now.getUTCFullYear() - 18;
}

export function formatDateInput(text: string): string {
  const cleaned = text.replace(/\D/g, '').slice(0, 8);
  if (cleaned.length > 4) {
    return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4)}`;
  }
  if (cleaned.length > 2) {
    return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
  }
  return cleaned;
}

export function parseStrictCalendarDate(value: string): string | null {
  const trimmed = value.trim();
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  const iso = dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : trimmed;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    return null;
  }
  return iso;
}

export function toBackendDate(value: string): string {
  const iso = parseStrictCalendarDate(value);
  if (!iso) {
    throw new Error('Please enter a valid date of birth.');
  }
  return iso;
}

export function toDisplayDate(value: string): string {
  const trimmed = value.trim();
  const isoPrefix = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  return isoPrefix ? `${isoPrefix[3]}/${isoPrefix[2]}/${isoPrefix[1]}` : trimmed;
}

export interface DobValidationResult {
  valid: boolean;
  iso?: string;
  age?: number;
  error?: string;
}

export function validateDob(value: string, now: Date = new Date()): DobValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: 'Date of birth is required (DD/MM/YYYY).' };
  }
  const iso = parseStrictCalendarDate(trimmed);
  if (!iso) {
    return { valid: false, error: 'Enter a valid calendar date in DD/MM/YYYY format.' };
  }
  const [yearStr, monthStr, dayStr] = iso.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (year < MIN_DOB_YEAR) {
    return {
      valid: false,
      error: `Birth year must be ${MIN_DOB_YEAR} or later.`,
    };
  }

  const birthUtc = Date.UTC(year, month - 1, day);
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (birthUtc > nowUtc) {
    return { valid: false, error: 'Date of birth cannot be in the future.' };
  }

  let age = now.getUTCFullYear() - year;
  const mDiff = now.getUTCMonth() + 1 - month;
  if (mDiff < 0 || (mDiff === 0 && now.getUTCDate() < day)) {
    age--;
  }

  if (age < 18) {
    return {
      valid: false,
      age,
      error: 'Driver must be at least 18 years old to register.',
    };
  }

  return { valid: true, iso, age };
}

export interface ExpiryValidationResult {
  valid: boolean;
  isoDate?: string;
  isoTimestamp?: string;
  error?: string;
}

export function validateFutureExpiryDate(
  value: string,
  now: Date = new Date(),
): ExpiryValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: 'Expiry date is required (DD/MM/YYYY).' };
  }
  const isoDate = parseStrictCalendarDate(trimmed);
  if (!isoDate) {
    return { valid: false, error: 'Enter a valid calendar date in DD/MM/YYYY format.' };
  }
  const endOfDay = new Date(`${isoDate}T23:59:59.999Z`);
  const todayIso = now.toISOString().slice(0, 10);
  if (isoDate <= todayIso || endOfDay.getTime() <= now.getTime()) {
    return { valid: false, error: 'Document is expired. Enter a future expiry date.' };
  }
  return {
    valid: true,
    isoDate,
    isoTimestamp: endOfDay.toISOString(),
  };
}

export function normalizeRegistrationNumber(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_VEHICLE_REG_LENGTH);
}

export function isValidRegistrationNumber(value: string): boolean {
  return VEHICLE_REG_PATTERN.test(normalizeRegistrationNumber(value));
}

export interface ManufactureYearValidationResult {
  valid: boolean;
  year: number | null;
  error?: string;
}

export function validateManufactureYear(
  value: string | number | null | undefined,
  now: Date = new Date(),
): ManufactureYearValidationResult {
  if (value === null || value === undefined || String(value).trim() === '') {
    return { valid: true, year: null };
  }
  const str = String(value).trim();
  if (!/^\d{4}$/.test(str)) {
    return { valid: false, year: null, error: 'Enter a 4-digit manufacture year.' };
  }
  const parsed = Number(str);
  const maxYear = now.getUTCFullYear() + 1;
  if (!Number.isInteger(parsed) || parsed < MIN_VEHICLE_YEAR || parsed > maxYear) {
    return {
      valid: false,
      year: null,
      error: `Manufacture year must be between ${MIN_VEHICLE_YEAR} and ${maxYear}.`,
    };
  }
  return { valid: true, year: parsed };
}

export function personalInfoPayload(draft: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | '';
  profilePhotoDataUrl?: string | null;
}): SaveDriverProfileRequestDto {
  if (!draft.gender) {
    throw new Error('Please select your gender.');
  }
  return {
    name: `${draft.firstName.trim()} ${draft.lastName.trim()}`.trim(),
    dateOfBirth: toBackendDate(draft.dateOfBirth),
    gender: draft.gender,
    ...(draft.profilePhotoDataUrl !== undefined
      ? { profilePhotoDataUrl: draft.profilePhotoDataUrl }
      : {}),
  };
}

export type ReviewDocumentState = 'READY' | 'MISSING' | 'EXPIRED';

export interface ReviewDocumentItem {
  type: DocumentType | 'PROFILE_PHOTO';
  label: string;
  status: ReviewDocumentState;
  detail: string;
  stepNumber: number;
}

export function getServerDocumentStatus(
  documents: DriverDocumentDto[],
  type: DocumentType,
  now: Date = new Date(),
): { status: ReviewDocumentState; expiresAtDisplay?: string } {
  const realDocs = documents.filter(
    (doc) => doc.type === type && !doc.storageKey.startsWith('mock/'),
  );
  if (realDocs.length === 0) {
    return { status: 'MISSING' };
  }

  for (const doc of realDocs) {
    if (type === 'GOVERNMENT_ID') {
      if (!doc.expiresAt || new Date(doc.expiresAt).getTime() > now.getTime()) {
        return {
          status: 'READY',
          ...(doc.expiresAt ? { expiresAtDisplay: toDisplayDate(doc.expiresAt) } : {}),
        };
      }
    } else if (doc.expiresAt && new Date(doc.expiresAt).getTime() > now.getTime()) {
      return {
        status: 'READY',
        expiresAtDisplay: toDisplayDate(doc.expiresAt),
      };
    }
  }

  const latest = realDocs[realDocs.length - 1];
  return {
    status: 'EXPIRED',
    ...(latest?.expiresAt ? { expiresAtDisplay: toDisplayDate(latest.expiresAt) } : {}),
  };
}

export interface AuthoritativeReviewSummary {
  fullName: string | null;
  dobDisplay: string | null;
  genderDisplay: string | null;
  cityDisplay: string | null;
  citySavedOnServer: boolean;
  vehicleTypeDisplay: string;
  registrationNumber: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  manufactureYear: number | null;
  vehicleSavedOnServer: boolean;
  documentItems: ReviewDocumentItem[];
  canSubmit: boolean;
  blockingReasons: string[];
}

export function evaluateKycReviewState(params: {
  driver: DriverDto | null;
  vehicle: VehicleDto | null;
  documents: DriverDocumentDto[];
  draft: OnboardingDraft;
  now?: Date;
}): AuthoritativeReviewSummary {
  const { driver, vehicle, documents, draft, now = new Date() } = params;

  const fullName = driver?.name?.trim() || `${draft.firstName} ${draft.lastName}`.trim() || null;
  const rawDob = driver?.dateOfBirth || draft.dateOfBirth || '';
  const dobValidation = rawDob ? validateDob(toDisplayDate(rawDob), now) : { valid: false };
  const dobDisplay = dobValidation.valid ? toDisplayDate(rawDob) : null;

  const rawGender = driver?.gender || draft.gender || '';
  const genderDisplay =
    rawGender === 'MALE'
      ? 'Male'
      : rawGender === 'FEMALE'
        ? 'Female'
        : rawGender === 'OTHER'
          ? 'Other'
          : null;

  const cityDisplay = (draft.city || driver?.address || '').trim() || null;
  const citySavedOnServer = Boolean(
    driver?.address && cityDisplay && driver.address.trim() === cityDisplay,
  );

  const effectiveVehicleType = vehicle?.vehicleType || draft.vehicleType || 'CAB';
  const vehicleTypeDisplay = effectiveVehicleType === 'CAB' ? 'Cab / Car' : 'E-Rickshaw';

  const rawReg = vehicle?.registrationNumber || draft.registrationNumber || '';
  const normalizedReg = normalizeRegistrationNumber(rawReg);
  const registrationNumber = isValidRegistrationNumber(normalizedReg) ? normalizedReg : null;

  const make = (vehicle?.make || draft.make || '').trim() || null;
  const model = (vehicle?.model || draft.model || '').trim() || null;
  const color = (vehicle?.color || draft.color || '').trim() || null;
  const manufactureYear = vehicle?.manufactureYear ?? draft.manufactureYear ?? null;
  const vehicleSavedOnServer = Boolean(
    vehicle &&
      driver?.currentVehicleId &&
      registrationNumber &&
      vehicle.registrationNumber === registrationNumber,
  );

  const dlStatus = getServerDocumentStatus(documents, 'DRIVING_LICENSE', now);
  const govtIdStatus = getServerDocumentStatus(documents, 'GOVERNMENT_ID', now);
  const rcStatus = getServerDocumentStatus(documents, 'REGISTRATION_CERTIFICATE', now);
  const insuranceStatus = getServerDocumentStatus(documents, 'INSURANCE', now);
  const permitStatus = getServerDocumentStatus(documents, 'PERMIT', now);
  const dlNumber = (driver?.dlNumber || draft.dlNumber || '').trim();
  const hasPersistedPhoto = Boolean(driver?.profilePhotoUrl);

  const documentItems: ReviewDocumentItem[] = [
    {
      type: 'DRIVING_LICENSE',
      label: 'Driving Licence',
      status: dlStatus.status === 'READY' && dlNumber.length >= 8 ? 'READY' : dlStatus.status === 'EXPIRED' ? 'EXPIRED' : 'MISSING',
      detail:
        dlStatus.status === 'READY' && dlNumber.length >= 8
          ? `${dlNumber}${dlStatus.expiresAtDisplay ? ` · Expires ${dlStatus.expiresAtDisplay}` : ''}`
          : dlStatus.status === 'EXPIRED'
            ? `Expired${dlStatus.expiresAtDisplay ? ` (${dlStatus.expiresAtDisplay})` : ''} — upload current licence`
            : 'Missing — upload in Step 4',
      stepNumber: 4,
    },
    {
      type: 'GOVERNMENT_ID',
      label: 'Government ID',
      status: govtIdStatus.status,
      detail:
        govtIdStatus.status === 'READY'
          ? 'Saved for review'
          : 'Missing — upload in Step 5',
      stepNumber: 5,
    },
    {
      type: 'REGISTRATION_CERTIFICATE',
      label: 'Registration Certificate (RC)',
      status: rcStatus.status,
      detail:
        rcStatus.status === 'READY'
          ? `Saved${rcStatus.expiresAtDisplay ? ` · Expires ${rcStatus.expiresAtDisplay}` : ''}`
          : rcStatus.status === 'EXPIRED'
            ? `Expired${rcStatus.expiresAtDisplay ? ` (${rcStatus.expiresAtDisplay})` : ''}`
            : 'Missing — upload in Step 5',
      stepNumber: 5,
    },
    {
      type: 'INSURANCE',
      label: 'Vehicle Insurance',
      status: insuranceStatus.status,
      detail:
        insuranceStatus.status === 'READY'
          ? `Saved${insuranceStatus.expiresAtDisplay ? ` · Expires ${insuranceStatus.expiresAtDisplay}` : ''}`
          : insuranceStatus.status === 'EXPIRED'
            ? `Expired${insuranceStatus.expiresAtDisplay ? ` (${insuranceStatus.expiresAtDisplay})` : ''}`
            : 'Missing — upload in Step 5',
      stepNumber: 5,
    },
    {
      type: 'PERMIT',
      label: 'Commercial Permit',
      status: permitStatus.status,
      detail:
        permitStatus.status === 'READY'
          ? `Saved${permitStatus.expiresAtDisplay ? ` · Expires ${permitStatus.expiresAtDisplay}` : ''}`
          : permitStatus.status === 'EXPIRED'
            ? `Expired${permitStatus.expiresAtDisplay ? ` (${permitStatus.expiresAtDisplay})` : ''}`
            : 'Missing — upload in Step 5',
      stepNumber: 5,
    },
    {
      type: 'PROFILE_PHOTO',
      label: 'Profile Photo',
      status: hasPersistedPhoto ? 'READY' : 'MISSING',
      detail: hasPersistedPhoto ? 'Photo saved for review' : 'Missing — save photo in Step 6',
      stepNumber: 6,
    },
  ];

  const blockingReasons: string[] = [];
  if (!fullName || !dobDisplay || !genderDisplay) {
    blockingReasons.push('Complete your personal information in Step 1.');
  }
  if (!cityDisplay) {
    blockingReasons.push('Select your operating city in Step 2.');
  }
  if (effectiveVehicleType === 'E_RICKSHAW') {
    blockingReasons.push('E-Rickshaw onboarding is coming soon. Select Cab / Car in Step 3.');
  }
  if (!registrationNumber || !make || !model || !color) {
    blockingReasons.push('Complete your vehicle registration, make, model, and colour in Step 3.');
  }
  for (const item of documentItems) {
    if (item.status !== 'READY') {
      blockingReasons.push(`${item.label} is ${item.status === 'EXPIRED' ? 'expired' : 'missing'} (Step ${item.stepNumber}).`);
    }
  }

  return {
    fullName,
    dobDisplay,
    genderDisplay,
    cityDisplay,
    citySavedOnServer,
    vehicleTypeDisplay,
    registrationNumber,
    make,
    model,
    color,
    manufactureYear,
    vehicleSavedOnServer,
    documentItems,
    canSubmit: blockingReasons.length === 0,
    blockingReasons,
  };
}

export function mapSubmissionError(err: unknown): {
  message: string;
  targetStep?: number;
  targetStepLabel?: string;
} {
  const raw = err instanceof Error ? err.message : 'Could not submit application. Please try again.';
  if (raw.includes('DRIVING_LICENSE') || raw.toLowerCase().includes('driving license')) {
    return {
      message: 'Your driving licence is missing or expired. Please upload a valid licence in Step 4.',
      targetStep: 4,
      targetStepLabel: 'Go to Step 4 (Driving Licence)',
    };
  }
  if (
    raw.includes('GOVERNMENT_ID') ||
    raw.includes('REGISTRATION_CERTIFICATE') ||
    raw.includes('INSURANCE') ||
    raw.includes('PERMIT') ||
    raw.toLowerCase().includes('government id')
  ) {
    return {
      message:
        'One or more identity or vehicle documents are missing or expired. Please review and upload them in Step 5.',
      targetStep: 5,
      targetStepLabel: 'Go to Step 5 (Vehicle Documents)',
    };
  }
  if (raw.toLowerCase().includes('vehicle') || raw.toLowerCase().includes('registration number')) {
    return {
      message: raw,
      targetStep: 3,
      targetStepLabel: 'Go to Step 3 (Vehicle Details)',
    };
  }
  return { message: raw };
}
