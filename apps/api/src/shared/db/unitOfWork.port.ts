/** Runs related persistence operations as a single atomic change. */
export interface UnitOfWorkPort {
  run<T>(work: () => Promise<T>): Promise<T>;
}
