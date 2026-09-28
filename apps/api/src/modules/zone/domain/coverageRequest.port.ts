export interface CoverageRequestInput {
  lat: number;
  lng: number;
  riderId?: string | null | undefined;
}

export interface CoverageRequestRepositoryPort {
  recordCoverageRequest(input: CoverageRequestInput): Promise<void>;
}
