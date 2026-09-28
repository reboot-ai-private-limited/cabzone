import { z } from 'zod';
import {
  DRIVER_APPLICATION_STATUSES,
  DRIVER_KYC_STATUSES,
  DRIVER_OPERATIONAL_STATUSES,
  DRIVER_STATUSES,
  VEHICLE_CATEGORIES,
  VEHICLE_VERIFICATION_STATUSES,
} from '@Cabzone/contracts';
import { registry, successResponse, errorResponse, bearerAuth } from '@/shared/http/swagger.util.js';
import {
  requestOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  createDriverProfileSchema,
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
}
