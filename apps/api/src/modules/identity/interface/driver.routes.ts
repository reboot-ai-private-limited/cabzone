import { Router, type RequestHandler } from 'express';

export interface DriverRouterDeps {
  authenticate: RequestHandler;
  createProfile: RequestHandler;
  getProfile: RequestHandler;
  createApplication: RequestHandler;
  uploadDocument: RequestHandler;
  uploadLicenseFile: RequestHandler;
  uploadVehicleDocumentFile: RequestHandler;
  uploadIdentityDocumentFile: RequestHandler;
  registerVehicle: RequestHandler;
  submitApplication: RequestHandler;
  testApproveApplication?: RequestHandler | undefined;
}

export function buildDriverRouter(deps: DriverRouterDeps): Router {
  const router = Router();

  router.use(deps.authenticate);

  router.post('/profile', deps.createProfile);
  router.get('/profile/me', deps.getProfile);
  router.post('/application', deps.createApplication);
  router.post('/documents', deps.uploadDocument);
  router.post('/documents/license', deps.uploadLicenseFile);
  router.post('/documents/vehicle', deps.uploadVehicleDocumentFile);
  router.post('/documents/identity', deps.uploadIdentityDocumentFile);
  router.post('/vehicles', deps.registerVehicle);
  router.post('/application/submit', deps.submitApplication);
  if (deps.testApproveApplication) {
    router.post('/application/test-approve', deps.testApproveApplication);
  }

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
  router.get('/driver-applications', deps.authenticate, deps.requireAdminRole, deps.listApplications);
  router.get('/driver-applications/:id', deps.authenticate, deps.requireAdminRole, deps.getApplication);
  router.post('/driver-applications/:id/review', deps.authenticate, deps.requireAdminRole, deps.reviewApplication);

  return router;
}
