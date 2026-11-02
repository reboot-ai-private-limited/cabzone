import { z } from 'zod';
import {
  DRIVER_APPLICATION_STATUSES,
  DRIVER_KYC_STATUSES,
  DRIVER_OPERATIONAL_STATUSES,
  DRIVER_STATUSES,
  VEHICLE_CATEGORIES,
  VEHICLE_VERIFICATION_STATUSES,
} from '@cabzone/contracts';
import { allowDevShortcuts } from '@/config/env.js';
import {
  registry,
  successResponse,
  errorResponse,
  bearerAuth,
} from '@/shared/http/swagger.util.js';
import {
  adminLoginSchema,
  adminUpdateRiderProfileSchema,
  adminUserIdParamSchema,
  createAdminUserSchema,
  listAdminUsersQuerySchema,
  listRidersQuerySchema,
  refreshTokenSchema,
  requestOtpSchema,
  riderIdParamSchema,
  updateAdminUserSchema,
  updateAdminUserStatusSchema,
  updateRiderProfileSchema,
  updateRiderStatusSchema,
  verifyOtpSchema,
} from './identity.validation.js';
import {
  createDriverProfileRequestSchema,
  listDriverApplicationsQuerySchema,
  registerVehicleRequestSchema,
  reviewApplicationRequestSchema,
  updateDriverStatusRequestSchema,
  updateDriverProfileRequestSchema,
  uploadDriverDocumentRequestSchema,
  uploadDriverLicenseFileRequestSchema,
  uploadVehicleDocumentFileRequestSchema,
  uploadIdentityDocumentFileRequestSchema,
} from './kyc.validation.js';

const driverProfileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().nullable().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
  dateOfBirth: z.string().date().nullable().optional(),
  profilePhotoUrl: z.string().url().nullable().optional(),
  status: z.enum(DRIVER_STATUSES),
  kycStatus: z.enum(DRIVER_KYC_STATUSES),
  operationalStatus: z.enum(DRIVER_OPERATIONAL_STATUSES),
});

let registered = false;

export function registerIdentitySwaggerPaths(): void {
  if (registered) return;
  registered = true;

  // Auth OTP Request
  registry.registerPath({
    method: 'post',
    path: '/v1/auth/otp/request',
    tags: ['Auth'],
    summary: 'Request OTP for mobile authentication',
    request: {
      body: { content: { 'application/json': { schema: requestOtpSchema } } },
    },
    responses: {
      200: {
        description: 'OTP dispatched',
        content: {
          'application/json': { schema: successResponse(z.object({ status: z.string() })) },
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
      body: { content: { 'application/json': { schema: verifyOtpSchema } } },
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
      body: { content: { 'application/json': { schema: refreshTokenSchema } } },
    },
    responses: {
      200: {
        description: 'Token refreshed',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({ accessToken: z.string(), refreshToken: z.string() }),
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
          'application/json': { schema: successResponse(z.object({ loggedOut: z.boolean() })) },
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
      body: { content: { 'application/json': { schema: adminLoginSchema } } },
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
    summary: 'Create or update personal driver profile and optional photo',
    security: bearerAuth,
    request: {
      body: { content: { 'application/json': { schema: createDriverProfileRequestSchema } } },
    },
    responses: {
      201: {
        description: 'Driver profile created',
        content: { 'application/json': { schema: successResponse(driverProfileSchema) } },
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
                driver: driverProfileSchema.nullable(),
                vehicle: z.any().nullable(),
                application: z.any().nullable(),
                documents: z.array(z.any()),
              }),
            ),
          },
        },
      },
    },
  });

  // Driver Initialize Application
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/application',
    tags: ['Driver Onboarding'],
    summary: 'Initialize or resume a DRAFT driver KYC application',
    security: bearerAuth,
    responses: {
      201: {
        description: 'Driver application initialized',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
    },
  });

  // Deprecated generic document endpoint (enforces dedicated file routes)
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/documents',
    tags: ['Driver Onboarding'],
    summary: 'Deprecated metadata-only upload endpoint (returns 400 instructing file upload)',
    security: bearerAuth,
    request: {
      body: { content: { 'application/json': { schema: uploadDriverDocumentRequestSchema } } },
    },
    responses: {
      400: {
        description: 'Use dedicated file upload endpoints',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  // Driver Licence File
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/documents/license',
    tags: ['Driver Onboarding'],
    summary: 'Upload a private driving licence PDF or JPEG (maximum 500 KB), or update its expiry',
    security: bearerAuth,
    request: {
      body: { content: { 'application/json': { schema: uploadDriverLicenseFileRequestSchema } } },
    },
    responses: {
      201: {
        description: 'Driving licence stored and linked to the authenticated driver application',
        content: {
          'application/json': {
            schema: successResponse(
              z.object({
                id: z.string().uuid(),
                type: z.literal('DRIVING_LICENSE'),
                storageKey: z.string(),
                documentHash: z.string(),
              }),
            ),
          },
        },
      },
      400: {
        description: 'Invalid file or application state',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  // Driver Government ID File
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/documents/identity',
    tags: ['Driver Onboarding'],
    summary: 'Upload a private Government ID PDF or JPEG (maximum 500 KB)',
    security: bearerAuth,
    request: {
      body: {
        content: { 'application/json': { schema: uploadIdentityDocumentFileRequestSchema } },
      },
    },
    responses: {
      201: { description: 'Government ID stored and linked to the driver application' },
      400: {
        description: 'Invalid file or application state',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  // Driver Vehicle Document File
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/documents/vehicle',
    tags: ['Driver Onboarding'],
    summary: 'Upload a private RC, insurance, or permit PDF or JPEG (maximum 500 KB)',
    security: bearerAuth,
    request: {
      body: { content: { 'application/json': { schema: uploadVehicleDocumentFileRequestSchema } } },
    },
    responses: {
      201: { description: 'Vehicle document stored and linked to the driver application' },
      400: {
        description: 'Invalid file, expiry, or application state',
        content: { 'application/json': { schema: errorResponse } },
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
      body: { content: { 'application/json': { schema: registerVehicleRequestSchema } } },
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

  registry.registerPath({
    method: 'post',
    path: '/v1/driver/application/renew',
    tags: ['Driver Onboarding'],
    summary: 'Open a renewal application for an expiring or expired driver document',
    security: bearerAuth,
    responses: {
      201: {
        description: 'Renewal application created',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
      403: {
        description: 'Driver required',
        content: { 'application/json': { schema: errorResponse } },
      },
      409: {
        description: 'Renewal unavailable',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  // Driver Submit Application
  registry.registerPath({
    method: 'post',
    path: '/v1/driver/application/submit',
    tags: ['Driver Onboarding'],
    summary: 'Submit authenticated driver application for admin review',
    security: bearerAuth,
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

  if (allowDevShortcuts) {
    registry.registerPath({
      method: 'post',
      path: '/v1/driver/application/test-approve',
      tags: ['Driver Onboarding'],
      summary: 'Approve driver profile and seed starter wallet in development environments',
      security: bearerAuth,
      responses: {
        200: {
          description: 'Driver approved for local testing',
          content: { 'application/json': { schema: successResponse(z.any()) } },
        },
      },
    });
  }

  // Admin List Driver Applications
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/driver-applications',
    tags: ['Admin Onboarding'],
    summary: 'List driver KYC applications (Super, Support, or Finance Admin)',
    security: bearerAuth,
    request: { query: listDriverApplicationsQuerySchema },
    responses: {
      200: {
        description: 'Driver applications list',
        content: { 'application/json': { schema: successResponse(z.array(z.any())) } },
      },
      403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  // Admin Get Driver Application Detail
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/driver-applications/{id}',
    tags: ['Admin Onboarding'],
    summary: 'Get driver dossier and KYC metadata without eager private file URLs',
    security: bearerAuth,
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        description: 'Driver application dossier',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
      403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponse } } },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/v1/admin/driver-applications/{id}/documents/{documentId}/preview',
    tags: ['Admin Onboarding'],
    summary: 'Issue an audited short-lived private document preview (SUPER_ADMIN)',
    security: bearerAuth,
    request: { params: z.object({ id: z.string(), documentId: z.string() }) },
    responses: {
      200: {
        description: 'Signed preview URL and expiry',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
      403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponse } } },
      404: {
        description: 'Document unavailable',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/v1/admin/driver-documents/{documentId}/content',
    tags: ['Admin Onboarding'],
    summary: 'Stream private KYC document bytes with a short-lived signed URL',
    request: {
      params: z.object({ documentId: z.string() }),
      query: z.object({ exp: z.coerce.number().int(), sig: z.string() }),
    },
    responses: {
      200: { description: 'Private document bytes, no-store' },
      403: {
        description: 'Invalid or expired signature',
        content: { 'application/json': { schema: errorResponse } },
      },
      404: {
        description: 'Document unavailable',
        content: { 'application/json': { schema: errorResponse } },
      },
    },
  });

  // Admin Review Driver Application
  registry.registerPath({
    method: 'post',
    path: '/v1/admin/driver-applications/{id}/review',
    tags: ['Admin Onboarding'],
    summary: 'Review and approve/reject driver application (SUPER_ADMIN)',
    security: bearerAuth,
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: reviewApplicationRequestSchema } } },
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
      403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  // Admin Update Driver Profile
  registry.registerPath({
    method: 'patch',
    path: '/v1/admin/driver-applications/{id}',
    tags: ['Admin Onboarding'],
    summary: 'Update driver profile details, phone, address, DL, and vehicle (SUPER_ADMIN)',
    security: bearerAuth,
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: updateDriverProfileRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Driver profile updated',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
      400: { description: 'Validation error', content: { 'application/json': { schema: errorResponse } } },
      403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponse } } },
      404: { description: 'Not found', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  // Admin Update Driver Status
  registry.registerPath({
    method: 'patch',
    path: '/v1/admin/driver-applications/{id}/status',
    tags: ['Admin Onboarding'],
    summary: 'Suspend or reactivate driver account (SUPER_ADMIN)',
    security: bearerAuth,
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: updateDriverStatusRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Driver status updated',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
      403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponse } } },
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

  // Rider Update Profile (Me)
  registry.registerPath({
    method: 'patch',
    path: '/v1/riders/me',
    tags: ['Rider Profile'],
    summary: 'Update current authenticated rider profile',
    security: bearerAuth,
    request: {
      body: { content: { 'application/json': { schema: updateRiderProfileSchema } } },
    },
    responses: {
      200: {
        description: 'Rider profile updated',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
    },
  });

  // Admin List Riders
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/riders',
    tags: ['Admin Customers'],
    summary: 'List customers / riders with filtering and pagination (Super or Support Admin)',
    security: bearerAuth,
    request: { query: listRidersQuerySchema },
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
      403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  // Admin Get Rider Detail
  registry.registerPath({
    method: 'get',
    path: '/v1/admin/riders/{id}',
    tags: ['Admin Customers'],
    summary: 'Get full customer / rider dossier and stats (Super or Support Admin)',
    security: bearerAuth,
    request: { params: riderIdParamSchema },
    responses: {
      200: {
        description: 'Customer detail dossier',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
      403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  // Admin Update Rider Profile
  registry.registerPath({
    method: 'patch',
    path: '/v1/admin/riders/{id}',
    tags: ['Admin Customers'],
    summary: 'Update customer profile fields (Super or Support Admin)',
    security: bearerAuth,
    request: {
      params: riderIdParamSchema,
      body: { content: { 'application/json': { schema: adminUpdateRiderProfileSchema } } },
    },
    responses: {
      200: {
        description: 'Customer profile updated',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
      403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponse } } },
    },
  });

  // Admin Update Rider Status
  registry.registerPath({
    method: 'patch',
    path: '/v1/admin/riders/{id}/status',
    tags: ['Admin Customers'],
    summary: 'Suspend or reactivate customer account (Super or Support Admin)',
    security: bearerAuth,
    request: {
      params: riderIdParamSchema,
      body: { content: { 'application/json': { schema: updateRiderStatusSchema } } },
    },
    responses: {
      200: {
        description: 'Customer status updated',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
      403: { description: 'Forbidden', content: { 'application/json': { schema: errorResponse } } },
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
        content: { 'application/json': { schema: successResponse(z.array(z.any())) } },
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
    request: { query: listAdminUsersQuerySchema },
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
    request: { params: adminUserIdParamSchema },
    responses: {
      200: {
        description: 'Admin user detail dossier',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
    },
  });

  // Admin Create User
  registry.registerPath({
    method: 'post',
    path: '/v1/admin/users',
    tags: ['Admin Users & Roles'],
    summary: 'Create and provision new administrative staff member (SUPER_ADMIN)',
    security: bearerAuth,
    request: {
      body: { content: { 'application/json': { schema: createAdminUserSchema } } },
    },
    responses: {
      201: {
        description: 'Admin user provisioned successfully',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
    },
  });

  // Admin Update User
  registry.registerPath({
    method: 'patch',
    path: '/v1/admin/users/{id}',
    tags: ['Admin Users & Roles'],
    summary: 'Update administrative staff details, role, or assigned zones (SUPER_ADMIN)',
    security: bearerAuth,
    request: {
      params: adminUserIdParamSchema,
      body: { content: { 'application/json': { schema: updateAdminUserSchema } } },
    },
    responses: {
      200: {
        description: 'Admin user updated successfully',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
    },
  });

  // Admin Update User Status
  registry.registerPath({
    method: 'patch',
    path: '/v1/admin/users/{id}/status',
    tags: ['Admin Users & Roles'],
    summary:
      'Suspend or reactivate administrative staff account and revoke active sessions (SUPER_ADMIN)',
    security: bearerAuth,
    request: {
      params: adminUserIdParamSchema,
      body: { content: { 'application/json': { schema: updateAdminUserStatusSchema } } },
    },
    responses: {
      200: {
        description: 'Admin user status updated successfully',
        content: { 'application/json': { schema: successResponse(z.any()) } },
      },
    },
  });
}
