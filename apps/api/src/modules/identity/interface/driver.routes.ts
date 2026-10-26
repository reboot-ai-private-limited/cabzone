import { Router, type RequestHandler } from 'express';

export interface DriverRouterDeps {
  authenticate: RequestHandler;
  createProfile: RequestHandler;
  getProfile: RequestHandler;
  createApplication: RequestHandler;
  renewApplication?: RequestHandler | undefined;
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
  if (deps.renewApplication) {
    router.post('/application/renew', deps.renewApplication);
  }
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
  requireApplicationScope?: RequestHandler | undefined;
  reviewApplication: RequestHandler;
  listApplications: RequestHandler;
  getApplication: RequestHandler;
  updateDriverStatus?: RequestHandler | undefined;
  previewDocument?: RequestHandler | undefined;
  streamDocumentContent?: RequestHandler | undefined;
}

export function buildAdminDriverRouter(deps: AdminDriverRouterDeps): Router {
  const router = Router();
  const singleAppGuard = deps.requireApplicationScope ?? deps.requireAdminRole;

  router.get('/driver-applications', deps.authenticate, deps.requireAdminRole, deps.listApplications);
  router.get('/driver-applications/:id', deps.authenticate, singleAppGuard, deps.getApplication);
  router.post('/driver-applications/:id/review', deps.authenticate, singleAppGuard, deps.reviewApplication);
  if (deps.updateDriverStatus) {
    router.patch('/driver-applications/:id/status', deps.authenticate, singleAppGuard, deps.updateDriverStatus);
  }
  if (deps.previewDocument) {
    router.post(
      '/driver-applications/:id/documents/:documentId/preview',
      deps.authenticate,
      singleAppGuard,
      deps.previewDocument,
    );
  }
  if (deps.streamDocumentContent) {
    router.get('/driver-documents/:documentId/content', deps.streamDocumentContent);
  }

  return router;
}
