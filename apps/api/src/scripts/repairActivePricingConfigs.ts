import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

export type Price = {
  _id: string;
  level?: 'CITY' | 'STATE' | 'GLOBAL' | null;
  city_zone_id?: string | null;
  state_code?: string | null;
  vehicle_type?: string | null;
  version?: number;
  effective_from?: Date;
  effective_to?: Date | null;
  created_at?: Date;
  status: string;
};

const indexKeys = { level: 1, city_zone_id: 1, state_code: 1, vehicle_type: 1 } as const;
const indexOptions = { unique: true, partialFilterExpression: { status: 'ACTIVE' } } as const;

function canonicalScope(price: Price) {
  const level =
    price.level ?? (price.city_zone_id ? 'CITY' : price.state_code ? 'STATE' : 'GLOBAL');
  const cityZoneId = level === 'CITY' ? (price.city_zone_id ?? null) : null;
  const stateCode = level === 'STATE' ? (price.state_code?.toUpperCase() ?? null) : null;
  if (
    !price.vehicle_type ||
    (level === 'CITY' && !cityZoneId) ||
    (level === 'STATE' && !stateCode)
  ) {
    throw new Error(`Cannot infer pricing scope for ${price._id}; repair this record manually.`);
  }
  return {
    level,
    city_zone_id: cityZoneId,
    state_code: stateCode,
    vehicle_type: price.vehicle_type,
  };
}

export async function repairActivePricingConfigs(
  collection: mongoose.mongo.Collection<Price>,
  apply: boolean,
) {
  const now = new Date();
  const active = await collection.find({ status: 'ACTIVE' }).toArray();
  const groups = new Map<string, Price[]>();
  for (const price of active) {
    const key = JSON.stringify(canonicalScope(price));
    groups.set(key, [...(groups.get(key) ?? []), price]);
  }

  let duplicateGroups = 0;
  let retired = 0;
  for (const [scope, prices] of groups) {
    prices.sort((a, b) => {
      const effective = (price: Price) =>
        Number(
          (price.effective_from ?? new Date(0)) <= now &&
            (!price.effective_to || price.effective_to > now),
        );
      return (
        effective(b) - effective(a) ||
        (b.version ?? 0) - (a.version ?? 0) ||
        (b.created_at?.getTime() ?? 0) - (a.created_at?.getTime() ?? 0) ||
        b._id.localeCompare(a._id)
      );
    });
    const [keeper, ...duplicates] = prices;
    if (!keeper) continue;
    if (duplicates.length) {
      duplicateGroups++;
      process.stdout.write(
        `${scope}: keep ${keeper._id}; retire ${duplicates.map((p) => p._id).join(', ')}\n`,
      );
    }
    if (!apply) continue;

    for (const duplicate of duplicates) {
      const result = await collection.updateOne(
        { _id: duplicate._id, status: 'ACTIVE' },
        { $set: { status: 'RETIRED', effective_to: now }, $inc: { version: 1 } },
      );
      if (result.matchedCount !== 1)
        throw new Error(`Pricing changed during repair: ${duplicate._id}`);
      retired++;
    }
    const scopeFields = canonicalScope(keeper);
    const result = await collection.updateOne(
      { _id: keeper._id, status: 'ACTIVE' },
      { $set: scopeFields },
    );
    if (result.matchedCount !== 1) throw new Error(`Pricing changed during repair: ${keeper._id}`);
  }

  if (apply) await collection.createIndex(indexKeys, indexOptions);
  process.stdout.write(
    `${apply ? 'Applied' : 'Dry run'}: ${duplicateGroups} duplicate scopes, ${retired} prices retired${apply ? '; unique ACTIVE index ensured' : ''}.\n`,
  );
  return { duplicateGroups, retired };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('Set MONGO_URI for the target database.');
  // Pause admin pricing writes and back up pricing_configs before --apply.
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 5000 });
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('MongoDB did not expose a database handle.');
    await repairActivePricingConfigs(db.collection<Price>('pricing_configs'), apply);
  } finally {
    await mongoose.disconnect();
  }
}
