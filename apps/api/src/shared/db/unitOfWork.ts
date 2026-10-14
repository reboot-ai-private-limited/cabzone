import mongoose from 'mongoose';
import type { UnitOfWorkPort } from './unitOfWork.port.js';

// Mongoose attaches this transaction's session to queries and model writes,
// including repository calls, without leaking driver sessions into domain ports.
mongoose.set('transactionAsyncLocalStorage', true);

export class MongoUnitOfWork implements UnitOfWorkPort {
  run<T>(work: () => Promise<T>): Promise<T> {
    return mongoose.connection.transaction(work, {
      readPreference: 'primary',
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  }
}
