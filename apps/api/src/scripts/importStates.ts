import { readFile } from 'node:fs/promises';
import { connectMongo, disconnectMongo } from '../shared/db/mongo.js';
import { logger } from '../shared/logging/logger.js';
import {
  featuresFromGeoJson,
  ImportStateBoundariesUseCase,
  LAUNCH_STATE_CODES,
  MongoStateBoundaryRepository,
  StateBoundaryModel,
} from '../modules/stateBoundary/index.js';

/**
 * Usage: pnpm --filter @cabzone/api import:states <geojson-path> [source] [sourceVersion]
 *
 * Same import as the admin panel. Only the launch states (WB, BR, SK, AS) are imported; every
 * other feature is skipped, which is what makes the rest of India NOT_SERVICEABLE.
 */
async function main() {
  const [path, source = 'INDIA_STATE_BOUNDARY_DATASET', sourceVersion = null] = process.argv.slice(2);
  if (!path) {
    throw new Error('Usage: import:states <geojson-path> [source] [sourceVersion]');
  }

  const geojson: unknown = JSON.parse(await readFile(path, 'utf8'));

  await connectMongo();
  await StateBoundaryModel.syncIndexes();
  const result = await new ImportStateBoundariesUseCase(new MongoStateBoundaryRepository()).execute({
    features: featuresFromGeoJson(geojson),
    source,
    sourceVersion,
  });

  logger.info(result, 'State boundary import finished');
  if (result.missing.length > 0 || result.rejected.length > 0) {
    logger.warn(
      { expected: LAUNCH_STATE_CODES, missing: result.missing, rejected: result.rejected },
      'Some launch states were not imported; they remain NOT_SERVICEABLE.',
    );
    process.exitCode = 1;
  }
  await disconnectMongo();
}

main().catch((err) => {
  logger.error({ err }, 'State boundary import failed');
  process.exit(1);
});
