import { MongoMemoryReplSet } from 'mongodb-memory-server';

async function startDevDb() {
  console.log('[dev-db] Starting embedded MongoDB replica set rs0 on port 27017...');

  const replSet = await MongoMemoryReplSet.create({
    replSet: {
      name: 'rs0',
      count: 1,
      storageEngine: 'wiredTiger',
    },
    instanceOpts: [
      {
        port: 27017,
      },
    ],
  });

  const uri = replSet.getUri('Cabzonee_dev');
  console.log(`[dev-db] Embedded MongoDB replica set ready!`);
  console.log(`[dev-db] URI: ${uri}`);
  console.log(`[dev-db] Press Ctrl+C to stop.`);

  const shutdown = async () => {
    console.log('[dev-db] Stopping embedded database...');
    await replSet.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startDevDb().catch((err) => {
  console.error('[dev-db] Failed to start embedded database:', err);
  process.exit(1);
});
