import type { Router } from 'express';
import { env } from '@/config/env.js';
import {
  CreateDriverApplicationUseCase,
  CreateDriverProfileUseCase,
  GetDriverProfileUseCase,
  LogoutUseCase,
  RefreshTokenUseCase,
  RegisterDriverVehicleUseCase,
  RequestOtpUseCase,
  ReviewDriverApplicationUseCase,
  SubmitDriverApplicationUseCase,
  UploadDriverDocumentUseCase,
  VerifyOtpUseCase,
} from './application/useCases/index.js';
import {
  ConsoleSmsGatewayAdapter,
  JoseTokenAdapter,
  MemoryOtpStoreAdapter,
  MongoAdminUserRepository,
  MongoDriverApplicationRepository,
  MongoDriverDocumentRepository,
  MongoDriverRepository,
  MongoRiderRepository,
  MongoSessionRepository,
  MongoUserRepository,
  MongoVehicleRepository,
} from './infrastructure/index.js';
import {
  makeLogoutController,
  makeRefreshTokenController,
  makeRequestOtpController,
  makeVerifyOtpController,
} from './interface/auth.controller.js';
import { buildAuthRouter } from './interface/auth.routes.js';
import {
  makeCreateDriverApplicationController,
  makeCreateDriverProfileController,
  makeGetDriverProfileController,
  makeRegisterDriverVehicleController,
  makeReviewDriverApplicationController,
  makeSubmitDriverApplicationController,
  makeUploadDriverDocumentController,
} from './interface/driver.controller.js';
import { buildAdminDriverRouter, buildDriverRouter } from './interface/driver.routes.js';
import {
  makeAuthenticate,
  makeRequireZoneAccess,
  requireRole,
} from './interface/middlewares/index.js';

export interface IdentityContainer {
  buildAuthRouter: () => Router;
  buildDriverRouter: () => Router;
  buildAdminDriverRouter: () => Router;
  authenticate: ReturnType<typeof makeAuthenticate>;
  requireRole: typeof requireRole;
  requireZoneAccess: ReturnType<typeof makeRequireZoneAccess>;
}

export interface IdentityContainerDeps {
  userRepo?: MongoUserRepository;
  riderRepo?: MongoRiderRepository;
  sessionRepo?: MongoSessionRepository;
  adminRepo?: MongoAdminUserRepository;
  driverRepo?: MongoDriverRepository;
  applicationRepo?: MongoDriverApplicationRepository;
  documentRepo?: MongoDriverDocumentRepository;
  vehicleRepo?: MongoVehicleRepository;
  tokenAdapter?: JoseTokenAdapter;
  otpStore?: MemoryOtpStoreAdapter;
  smsGateway?: ConsoleSmsGatewayAdapter;
}

export function buildIdentityContainer(deps?: IdentityContainerDeps): IdentityContainer {
  const userRepo = deps?.userRepo ?? new MongoUserRepository();
  const riderRepo = deps?.riderRepo ?? new MongoRiderRepository();
  const sessionRepo = deps?.sessionRepo ?? new MongoSessionRepository();
  const adminRepo = deps?.adminRepo ?? new MongoAdminUserRepository();
  const driverRepo = deps?.driverRepo ?? new MongoDriverRepository();
  const applicationRepo = deps?.applicationRepo ?? new MongoDriverApplicationRepository();
  const documentRepo = deps?.documentRepo ?? new MongoDriverDocumentRepository();
  const vehicleRepo = deps?.vehicleRepo ?? new MongoVehicleRepository();
  const tokenAdapter = deps?.tokenAdapter ?? new JoseTokenAdapter(env.JWT_ACCESS_SECRET);
  const otpStore = deps?.otpStore ?? new MemoryOtpStoreAdapter();
  const smsGateway = deps?.smsGateway ?? new ConsoleSmsGatewayAdapter();

  const requestOtpUseCase = new RequestOtpUseCase({
    otpStore,
    smsGateway,
    otpPepper: env.OTP_PEPPER,
    devFixedOtp: env.DEV_FIXED_OTP,
  });

  const verifyOtpUseCase = new VerifyOtpUseCase({
    otpStore,
    userRepo,
    riderRepo,
    sessionRepo,
    tokenSigner: tokenAdapter,
    otpPepper: env.OTP_PEPPER,
    adminRepo,
    driverRepo,
  });

  const refreshTokenUseCase = new RefreshTokenUseCase({
    sessionRepo,
    tokenSigner: tokenAdapter,
    userRepo,
    riderRepo,
    driverRepo,
    adminRepo,
  });

  const logoutUseCase = new LogoutUseCase({
    sessionRepo,
  });

  const createDriverProfileUseCase = new CreateDriverProfileUseCase({
    driverRepo,
  });

  const getDriverProfileUseCase = new GetDriverProfileUseCase({
    driverRepo,
    vehicleRepo,
    applicationRepo,
    documentRepo,
  });

  const createDriverApplicationUseCase = new CreateDriverApplicationUseCase({
    driverRepo,
    applicationRepo,
  });

  const uploadDriverDocumentUseCase = new UploadDriverDocumentUseCase({
    driverRepo,
    applicationRepo,
    documentRepo,
  });

  const registerDriverVehicleUseCase = new RegisterDriverVehicleUseCase({
    driverRepo,
    vehicleRepo,
  });

  const submitDriverApplicationUseCase = new SubmitDriverApplicationUseCase({
    driverRepo,
    applicationRepo,
    documentRepo,
    vehicleRepo,
  });

  const reviewDriverApplicationUseCase = new ReviewDriverApplicationUseCase({
    driverRepo,
    applicationRepo,
    documentRepo,
    vehicleRepo,
  });

  const authenticate = makeAuthenticate({
    tokenVerifier: tokenAdapter,
    sessionRepo,
  });

  const requireZoneAccess = makeRequireZoneAccess({
    adminRepo,
  });

  return {
    buildAuthRouter: () =>
      buildAuthRouter({
        requestOtp: makeRequestOtpController(requestOtpUseCase),
        verifyOtp: makeVerifyOtpController(verifyOtpUseCase),
        refreshToken: makeRefreshTokenController(refreshTokenUseCase),
        logout: makeLogoutController(logoutUseCase),
        authenticate,
      }),
    buildDriverRouter: () =>
      buildDriverRouter({
        authenticate,
        createProfile: makeCreateDriverProfileController(createDriverProfileUseCase),
        getProfile: makeGetDriverProfileController(getDriverProfileUseCase),
        createApplication: makeCreateDriverApplicationController(createDriverApplicationUseCase),
        uploadDocument: makeUploadDriverDocumentController(uploadDriverDocumentUseCase),
        registerVehicle: makeRegisterDriverVehicleController(registerDriverVehicleUseCase),
        submitApplication: makeSubmitDriverApplicationController(submitDriverApplicationUseCase),
      }),
    buildAdminDriverRouter: () =>
      buildAdminDriverRouter({
        authenticate,
        requireAdminRole: requireRole('SUPER_ADMIN', 'CITY_ADMIN'),
        reviewApplication: makeReviewDriverApplicationController(reviewDriverApplicationUseCase),
      }),
    authenticate,
    requireRole,
    requireZoneAccess,
  };
}
