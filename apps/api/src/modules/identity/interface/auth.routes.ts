import { Router, type RequestHandler } from 'express';

export interface AuthRouterDeps {
  requestOtp: RequestHandler;
  verifyOtp: RequestHandler;
  refreshToken: RequestHandler;
  logout: RequestHandler;
  adminLogin: RequestHandler;
  authenticate: RequestHandler;
}

export function buildAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();

  router.post('/otp/request', deps.requestOtp);
  router.post('/otp/verify', deps.verifyOtp);
  router.post('/refresh', deps.refreshToken);
  router.post('/logout', deps.authenticate, deps.logout);
  router.post('/admin/login', deps.adminLogin);

  return router;
}
