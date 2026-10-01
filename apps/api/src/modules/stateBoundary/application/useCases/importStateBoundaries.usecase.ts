import {
  normalizeGeoJson,
  repairPolygonalGeometry,
  validateGeometry,
  Z_CODES,
  type GeoJsonGeometry,
} from '@cabzone/geo';
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
  /**
   * A state that is new to the system starts ACTIVE (serviceable) only if it is listed here;
   * every other new state is imported DISABLED until an admin enables it. Existing states keep
   * whatever status they already have.
   */
  activeOnImportStateCodes?: readonly string[];
  actorId?: string | null | undefined;
}

export interface ImportStateBoundariesResult {
  /** Every state stored from the file. */
  imported: string[];
  /** Subset of `imported` that was created disabled (not serviceable until enabled). */
  disabledOnImport: string[];
  /** Subset of `imported` whose border had self-crossings that were automatically repaired. */
  repaired: string[];
  rejected: { stateCode: string; reason: string }[];
  /** Launch states that were not found in the dataset. */
  missing: string[];
}

export class ImportStateBoundariesUseCase {
  constructor(private readonly repo: StateBoundaryRepositoryPort) {}

  async execute(input: ImportStateBoundariesInput): Promise<ImportStateBoundariesResult> {
    const launch = new Set(
      (input.activeOnImportStateCodes ?? LAUNCH_STATE_CODES).map((c) => c.toUpperCase()),
    );
    const result: ImportStateBoundariesResult = {
      imported: [],
      disabledOnImport: [],
      repaired: [],
      rejected: [],
      missing: [],
    };
    const seen = new Set<string>();

    for (const f of input.features) {
      const code = f.properties.stateCode?.trim().toUpperCase();
      if (!code) {
        const name = f.properties.stateName?.trim();
        result.rejected.push({
          stateCode: name ?? '?',
          reason:
            name === undefined
              ? 'Feature has no state code or state-name property.'
              : `Could not determine a state code for "${name}".`,
        });
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
      // State borders are reference geography, so the operational-zone area limits do not apply.
      const validate = (g: GeoJsonGeometry) =>
        validateGeometry(g, { enforceOperationalArea: false });
      let validation = validate(geometry);
      let repairNote: string | undefined;
      // Open datasets often carry tiny self-crossings; repair those rather than reject the state.
      // Anything else (unclosed ring, bad coordinates) is still a genuine rejection.
      const onlySelfIntersections =
        !validation.valid &&
        validation.violations
          .filter((v) => v.severity === 'ERROR')
          .every((v) => v.code === Z_CODES.Z005_SELF_INTERSECTION);
      if (onlySelfIntersections) {
        const repairedGeometry = repairPolygonalGeometry(geometry);
        if (repairedGeometry === null) {
          repairNote = 'automatic repair produced no usable geometry';
        } else {
          const revalidation = validate(repairedGeometry);
          if (revalidation.valid) {
            geometry = repairedGeometry;
            validation = revalidation;
            result.repaired.push(code);
          } else {
            const after = revalidation.violations.find((v) => v.severity === 'ERROR');
            repairNote = `still invalid after automatic repair: ${after?.message ?? 'unknown'}`;
          }
        }
      }
      if (!validation.valid) {
        const first = validation.violations.find((v) => v.severity === 'ERROR');
        const reason = first?.message ?? 'Invalid geometry.';
        result.rejected.push({
          stateCode: code,
          reason: repairNote === undefined ? reason : `${reason} (${repairNote})`,
        });
        continue;
      }

      // Any status: re-importing a disabled state must not reset it or its admin configuration.
      const existing = await this.repo.getByCode(code);
      const now = new Date();
      const saved = await this.repo.upsertByCode({
        id: existing?.id ?? newUuid(),
        stateCode: code,
        stateName: f.properties.stateName?.trim() || existing?.stateName || code,
        geometry,
        version: existing ? existing.version + 1 : 1,
        configVersion: existing ? existing.configVersion + 1 : 1,
        status: existing?.status ?? (launch.has(code) ? 'ACTIVE' : 'INACTIVE'),
        intrastateEnabled: existing?.intrastateEnabled ?? true,
        interstateDropOffEnabled: existing?.interstateDropOffEnabled ?? true,
        source: input.source,
        sourceVersion: input.sourceVersion,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      await this.repo.appendHistory({
        id: newUuid(),
        stateCode: code,
        action: 'IMPORTED',
        version: saved.version,
        configVersion: saved.configVersion,
        source: input.source,
        sourceVersion: input.sourceVersion,
        previousGeometry: existing?.geometry ?? null,
        actorId: input.actorId ?? null,
        at: now,
      });
      seen.add(code);
      result.imported.push(code);
      if (saved.status === 'INACTIVE' && !existing) result.disabledOnImport.push(code);
    }

    result.missing = [...launch].filter((c) => !seen.has(c));
    return result;
  }
}
