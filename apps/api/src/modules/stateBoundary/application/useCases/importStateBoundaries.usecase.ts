import { normalizeGeoJson, validateGeometry, type GeoJsonGeometry } from '@cabzone/geo';
import { newUuid } from '../../../../shared/ids.js';
import { LAUNCH_STATE_CODES, type StateBoundaryRepositoryPort } from '../../domain/index.js';

export interface StateFeature {
  properties: { stateCode?: string; stateName?: string; [k: string]: unknown };
  geometry: unknown;
}

export interface ImportStateBoundariesInput {
  features: StateFeature[];
  source: string;
  sourceVersion: string | null;
  /** Only these states are imported (and therefore serviceable). */
  allowedStateCodes?: readonly string[];
}

export interface ImportStateBoundariesResult {
  imported: string[];
  skippedNotServiceable: string[];
  rejected: { stateCode: string; reason: string }[];
  /** Allowed states that were not found in the dataset. */
  missing: string[];
}

export class ImportStateBoundariesUseCase {
  constructor(private readonly repo: StateBoundaryRepositoryPort) {}

  async execute(input: ImportStateBoundariesInput): Promise<ImportStateBoundariesResult> {
    const allowed = new Set(
      (input.allowedStateCodes ?? LAUNCH_STATE_CODES).map((c) => c.toUpperCase()),
    );
    const result: ImportStateBoundariesResult = {
      imported: [],
      skippedNotServiceable: [],
      rejected: [],
      missing: [],
    };
    const seen = new Set<string>();

    for (const f of input.features) {
      const code = f.properties.stateCode?.trim().toUpperCase();
      if (!code) {
        result.rejected.push({ stateCode: '?', reason: 'Feature has no stateCode property.' });
        continue;
      }
      if (!allowed.has(code)) {
        result.skippedNotServiceable.push(code);
        continue;
      }
      if (seen.has(code)) {
        result.rejected.push({ stateCode: code, reason: 'Duplicate stateCode in dataset.' });
        continue;
      }

      let geometry: GeoJsonGeometry;
      try {
        geometry = normalizeGeoJson(f.geometry as GeoJsonGeometry);
      } catch (err) {
        result.rejected.push({ stateCode: code, reason: (err as Error).message });
        continue;
      }
      const validation = validateGeometry(geometry);
      if (!validation.valid) {
        const first = validation.violations.find((v) => v.severity === 'ERROR');
        result.rejected.push({ stateCode: code, reason: first?.message ?? 'Invalid geometry.' });
        continue;
      }

      const existing = await this.repo.getActiveByCode(code);
      const now = new Date();
      await this.repo.upsertByCode({
        id: existing?.id ?? newUuid(),
        stateCode: code,
        stateName: f.properties.stateName?.trim() || code,
        geometry,
        version: existing ? existing.version + 1 : 1,
        status: 'ACTIVE',
        source: input.source,
        sourceVersion: input.sourceVersion,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      seen.add(code);
      result.imported.push(code);
    }

    result.missing = [...allowed].filter((c) => !seen.has(c));
    return result;
  }
}
