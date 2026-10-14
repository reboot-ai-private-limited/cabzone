import type { AuthContext } from '@cabzone/contracts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      adminCityZoneIds?: string[];
    }
  }
}

export type { AuthContext };
