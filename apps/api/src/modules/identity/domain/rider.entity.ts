export interface EmergencyContact {
  name: string;
  phoneE164: string;
}

export interface RiderEntity {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  emergencyContact: EmergencyContact | null;
  preferredLanguage: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
