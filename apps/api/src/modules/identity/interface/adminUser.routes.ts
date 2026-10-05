import { Router, type RequestHandler } from 'express';

export interface AdminUserRouterDeps {
  authenticate: RequestHandler;
  requireAdminRole: RequestHandler;
  requireSuperAdminRole: RequestHandler;
  listAdminUsers: RequestHandler;
  getAdminUser: RequestHandler;
  createAdminUser: RequestHandler;
  updateAdminUser: RequestHandler;
  updateAdminUserStatus: RequestHandler;
  getRolePermissions: RequestHandler;
}

export function buildAdminUserRouter(deps: AdminUserRouterDeps): Router {
  const router = Router();

  router.use(deps.authenticate);

  // Read endpoints accessible to all admin roles
  router.get('/roles/permissions', deps.requireAdminRole, deps.getRolePermissions);
  router.get('/', deps.requireAdminRole, deps.listAdminUsers);
  router.get('/:id', deps.requireAdminRole, deps.getAdminUser);

  // Mutations strictly restricted to SUPER_ADMIN
  router.post('/', deps.requireSuperAdminRole, deps.createAdminUser);
  router.patch('/:id/status', deps.requireSuperAdminRole, deps.updateAdminUserStatus);
  router.patch('/:id', deps.requireSuperAdminRole, deps.updateAdminUser);

  return router;
}
