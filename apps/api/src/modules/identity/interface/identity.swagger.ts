import { z } from 'zod';
import {
  DRIVER_APPLICATION_STATUSES,
  DRIVER_KYC_STATUSES,
  DRIVER_OPERATIONAL_STATUSES,
  DRIVER_STATUSES,
  VEHICLE_CATEGORIES,
  VEHICLE_VERIFICATION_STATUSES,
} from '@cabzone/contracts';
import { registry, successResponse, errorResponse, bearerAuth } from '@/shared/http/swagger.util.js';
import {
  adminLoginSchema,
  adminUserIdParamSchema,
  createAdminUserSchema,
  createDriverProfileSchema,
  listAdminUsersQuerySchema,
  refreshTokenSchema,
  requestOtpSchema,
  updateAdminUserSchema,
  updateAdminUserStatusSchema,
  verifyOtpSchema,
} from './identity.validation.js';
import {
  createVehicleSchema,
  submitDriverApplicationSchema,
  reviewDriverApplicationSchema,
} from './kyc.validation.js';

export function registerIdentitySwaggerPaths(): void {
  // Auth OTP Request
  registry.registerPath({
    method: 'post',
    path: '/v1/auth/otp/request',
    tags: ['Auth'],
    summary: 'Request OTP for mobile authentication',
    request: {
      body: {
        content: {
          'application/json': {
            schema: requestOtpSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'OTP dispatched',
        content: {
          'application/json': {
            schema: successResponse(z.object({ status: z.string() })),
          },
        },
      },
      400: {
        description: 'Invalid input',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  // Auth OTP Verify
  registry.registerPath({
    method: 'post',
    path: '/v1/auth/otp/verify',
    tags: ['Auth'],
    summary: 'Verify OTP and obtain JWT tokens',
    request: {
      body: {
        content: {
          'application/json': {
            schema: verifyOtpSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Authentication successful',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                accessToken: z.string(),
                refreshToken: z.string(),
                user: z.object({
                  id: z.string().uuid(),
                  phoneE164: z.string(),
                  roles: z.array(z.string()),
                }),
              }),
            ),
          },
        },
      },
      400: {
        description: 'Invalid or expired OTP',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  // Auth Refresh Token
  registry.registerPath({
    method: 'post',
    path: '/v1/auth/refresh',
    tags: ['Auth'],
    summary: 'Refresh access token with refresh token',
    request: {
      body: {
        content: {
          'application/json': {
            schema: refreshTokenSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Token refreshed',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                accessToken: z.string(),
                refreshToken: z.string(),
              }),
            ),
          },
        },
      },
      401: {
        description: 'Invalid or reused refresh token',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  // Auth Logout
  registry.registerPath({
    method: 'post',
    path: '/v1/auth/logout',
    tags: ['Auth'],
    summary: 'Revoke active refresh token / session',
    security: bearerAuth,
    responses: {
      200: {
        description: 'Successfully logged out',
        content: {
          'application/json': {
            schema: successResponse(z.object({ loggedOut: z.boolean() })),
          },
        },
      },
    },
  });

  // Admin Password Login
  registry.registerPath({
    method: 'post',
    path: '/v1/auth/admin/login',
    tags: ['Auth'],
    summary: 'Administrative staff authentication via password',
    request: {
      body: {
        content: {
          'application/json': {
            schema: adminLoginSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Admin authentication successful',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                accessToken: z.string(),
                refreshToken: z.string(),
                tokenType: z.string(),
                expiresIn: z.number(),
                user: z.object({
                  id: z.string().uuid(),
                  phoneE164: z.string(),
                  name: z.string().nullable().optional(),
                  role: z.string(),
                }),
              }),
            ),
          },
        },
      },
      401: {
        description: 'Invalid credentials or missing password',
        content: { 'application/json': { schema: errorResponse } },
      },
      403: {
        description: 'Account inactive or suspended',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  // Driver Create Profile
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/profile',
    tags: ['Driver Onboarding'],
    summary: 'Create driver profile',
    security: bearerAuth,
    request: {
      body: {
        content: {
          'application/json': {
            schema: createDriverProfileSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Driver profile created',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                id: z.string().uuid(),
                userId: z.string().uuid(),
                status: z.enum(DRIVER_STATUSES),
                kycStatus: z.enum(DRIVER_KYC_STATUSES),
                operationalStatus: z.enum(DRIVER_OPERATIONAL_STATUSES),
              }),
            ),
          },
        },
      },
    },
  });

  // Driver Get Me
  registry.registerPath({
    method: 'get',
    path: '/v1/driver/profile/me',
    tags: ['Driver Onboarding'],
    summary: 'Get current authenticated driver profile',
    security: bearerAuth,
    responses: {
      200: {
        description: 'Driver profile',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                id: z.string().uuid(),
                userId: z.string().uuid(),
                status: z.enum(DRIVER_STATUSES),
                kycStatus: z.enum(DRIVER_KYC_STATUSES),
                operationalStatus: z.enum(DRIVER_OPERATIONAL_STATUSES),
              }),
            ),
          },
        },
      },
    },
  });

  // Driver Register Vehicle
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/vehicles',
    tags: ['Driver Onboarding'],
    summary: 'Register driver vehicle',
    security: bearerAuth,
    request: {
      body: {
        content: {
          'application/json': {
            schema: createVehicleSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Vehicle registered',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                id: z.string().uuid(),
                driverId: z.string().uuid(),
                vehicleType: z.enum(VEHICLE_CATEGORIES),
                make: z.string(),
                model: z.string(),
                registrationNumber: z.string(),
                verificationStatus: z.enum(VEHICLE_VERIFICATION_STATUSES),
              }),
            ),
          },
        },
      },
    },
  });

  // Driver Submit Application
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/application/submit',
    tags: ['Driver Onboarding'],
    summary: 'Submit driver application for admin review',
    security: bearerAuth,
    request: {
      body: {
        content: {
          'application/json': {
            schema: submitDriverApplicationSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Application submitted',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                id: z.string().uuid(),
                status: z.enum(DRIVER_APPLICATION_STATUSES),
              }),
            ),
          },
        },
      },
    },
  });

  // Admin Review Driver Application
  registry.registerPath({
    method: 'post',
    path: '/v1/admin/driver-applications/{id}/review',
    tags: ['Admin Onboarding'],
    summary: 'Review and approve/reject driver application',
    security: bearerAuth,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: reviewDriverApplicationSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Application reviewed',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                id: z.string().uuid(),
                status: z.enum(DRIVER_APPLICATION_STATUSES),
              }),
            ),
          },
        },
      },
    },
  });

  // Rider Profile (Me)
  registry.registerPath({
    method: 'get',
    path: '/v1/riders/me',
    tags: ['Rider Profile'],
    summary: 'Get current authenticated rider profile',
    security: bearerAuth,
    responses: {
      200: {
        description: 'Rider profile retrieved',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                id: z.string().uuid(),
                userId: z.string().uuid(),
                name: z.string().nullable(),
                email: z.string().nullable(),
                preferredLanguage: z.string().nullable(),
                ratingAverage: z.number().nullable(),
                ratingCount: z.number(),
                createdAt: z.string(),
                updatedAt: z.string(),
              }),
            ),
          },
        },
      },
    },
  });

  // Admin List Riders
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/riders',
    tags: ['Admin Customers'],
    summary: 'List customers / riders with filtering and pagination',
    security: bearerAuth,
    responses: {
      200: {
        description: 'List of customers',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                riders: z.array(z.any()),
                total: z.number(),
                limit: z.number(),
                offset: z.number(),
              }),
            ),
          },
        },
      },
    },
  });

  // Admin Get Rider Detail
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/riders/{id}',
    tags: ['Admin Customers'],
    summary: 'Get full customer / rider dossier and stats',
    security: bearerAuth,
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Customer detail dossier',
        content: {
          'application/json': {
            schema: successResponse(z.any()),
          },
        },
      },
    },
  });

  // Admin Update Rider Status
  registry.registerPath({
    method: 'patch',
    path: '/v1/admin/riders/{id}/status',
    tags: ['Admin Customers'],
    summary: 'Suspend or reactivate customer account',
    security: bearerAuth,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Customer status updated',
        content: {
          'application/json': {
            schema: successResponse(z.any()),
          },
        },
      },
    },
  });

  // Admin Role Permissions Matrix
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/users/roles/permissions',
    tags: ['Admin Users & Roles'],
    summary: 'Get role permissions matrix for administrative staff',
    security: bearerAuth,
    responses: {
      200: {
        description: 'Role permissions matrix',
        content: {
          'application/json': {
            schema: successResponse(z.array(z.any())),
          },
        },
      },
    },
  });

  // Admin List Users
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/users',
    tags: ['Admin Users & Roles'],
    summary: 'List administrative staff with search, role, status, and zone filters',
    security: bearerAuth,
    request: {
      query: listAdminUsersQuerySchema,
    },
    responses: {
      200: {
        description: 'List of admin users',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                admins: z.array(z.any()),
                total: z.number(),
                limit: z.number(),
                offset: z.number(),
              }),
            ),
          },
        },
      },
    },
  });

  // Admin Get User Detail
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/users/{id}',
    tags: ['Admin Users & Roles'],
    summary: 'Get full admin user profile dossier and assigned zones',
    security: bearerAuth,
    request: {
      params: adminUserIdParamSchema,
    },
    responses: {
      200: {
        description: 'Admin user detail dossier',
        content: {
          'application/json': {
            schema: successResponse(z.any()),
          },
        },
      },
    },
  });

  // Admin Create User
  registry.registerPath({
    method: 'post',
    path: '/v1/admin/users',
    tags: ['Admin Users & Roles'],
    summary: 'Create and provision new administrative staff member',
    security: bearerAuth,
    request: {
      body: {
        content: {
          'application/json': {
            schema: createAdminUserSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Admin user provisioned successfully',
        content: {
          'application/json': {
            schema: successResponse(z.any()),
          },
        },
      },
    },
  });

  // Admin Update User
  registry.registerPath({
    method: 'patch',
    path: '/v1/admin/users/{id}',
    tags: ['Admin Users & Roles'],
    summary: 'Update administrative staff details, role, or assigned zones',
    security: bearerAuth,
    request: {
      params: adminUserIdParamSchema,
      body: {
        content: {
          'application/json': {
            schema: updateAdminUserSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Admin user updated successfully',
        content: {
          'application/json': {
            schema: successResponse(z.any()),
          },
        },
      },
    },
  });

  // Admin Update User Status
  registry.registerPath({
    method: 'patch',
    path: '/v1/admin/users/{id}/status',
    tags: ['Admin Users & Roles'],
    summary: 'Suspend or reactivate administrative staff account and revoke active sessions',
    security: bearerAuth,
    request: {
      params: adminUserIdParamSchema,
      body: {
        content: {
          'application/json': {
            schema: updateAdminUserStatusSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Admin user status updated successfully',
        content: {
          'application/json': {
            schema: successResponse(z.any()),
          },
        },
      },
    },
  });
}
