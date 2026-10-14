import type { UnitOfWorkPort } from '../../src/shared/db/unitOfWork.port.js';

/** Unit tests use isolated in-memory stores; rollback is covered by Mongo integration tests. */
export const unitOfWork: UnitOfWorkPort = {
  run: (work) => work(),
};
