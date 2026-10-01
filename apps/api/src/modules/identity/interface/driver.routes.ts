import { Router, type RequestHandler } from 'express';

export interface DriverRouterDeps {
  authenticate: RequestHandler;
  createProfile: RequestHandler;
  getProfile: RequestHandler;
  createApplication: RequestHandler;
  uploadDocument: RequestHandler;
  registerVehicle: RequestHandler;
  submitApplication: RequestHandler;
}

export function buildDriverRouter(deps: DriverRouterDeps): Router {
  const router = Router();

  router.use(deps.authenticate);

  router.post('/profile', deps.createProfile);
  router.get('/profile/me', deps.getProfile);
  router.post('/application', deps.createApplication);
  router.post('/documents', deps.uploadDocument);
  router.post('/vehicles', deps.registerVehicle);
  router.post('/application/submit', deps.submitApplication);

  return router;
}

export interface AdminDriverRouterDeps {
  authenticate: RequestHandler;
  requireAdminRole: RequestHandler;
  reviewApplication: RequestHandler;
  listApplications: RequestHandler;
  getApplication: RequestHandler;
}

export function buildAdminDriverRouter(deps: AdminDriverRouterDeps): Router {
  const router = Router();

  router.use(deps.authenticate);
  router.use(deps.requireAdminRole);

  router.get('/driver-applications', deps.listApplications);
  router.get('/driver-applications/:id', deps.getApplication);
  router.post('/driver-applications/:id/review', deps.reviewApplication);

  return router;
}
