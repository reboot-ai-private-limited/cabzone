import type { SaveDriverProfileRequestDto } from '@cabzone/contracts';

export function toBackendDate(value: string): string {
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const iso = parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : value;
  const date = new Date(`${iso}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== iso
  ) {
    throw new Error('Please enter a valid date of birth.');
  }
  return iso;
}

export function toDisplayDate(value: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return parts ? `${parts[3]}/${parts[2]}/${parts[1]}` : value;
}

export function personalInfoPayload(draft: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  profilePhotoDataUrl?: string | null;
}): SaveDriverProfileRequestDto {
  return {
    name: `${draft.firstName.trim()} ${draft.lastName.trim()}`.trim(),
    dateOfBirth: toBackendDate(draft.dateOfBirth),
    gender: draft.gender,
    ...(draft.profilePhotoDataUrl !== undefined
      ? { profilePhotoDataUrl: draft.profilePhotoDataUrl }
      : {}),
  };
}
