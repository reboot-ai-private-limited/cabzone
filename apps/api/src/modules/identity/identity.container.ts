import type { Router } from 'express';
import { env, allowDevShortcuts, isProdLike } from '@/config/env.js';
import type { OtpStorePort, SmsGatewayPort } from './domain/otp.port.js';
import type { DriverLicenseStoragePort } from './domain/driverLicenseStorage.port.js';
import { MongoOtpStoreAdapter } from './infrastructure/mongoOtpStore.adapter.js';
import { CloudinaryDriverPhotoAdapter } from './infrastructure/cloudinaryDriverPhoto.adapter.js';
import { CloudinaryDriverLicenseAdapter } from './infrastructure/cloudinaryDriverLicense.adapter.js';
import { MongoUnitOfWork } from '@/shared/db/unitOfWork.js';
import type { UnitOfWorkPort } from '@/shared/db/unitOfWork.port.js';
import { makeRequireAdminScope } from './interface/middlewares/requireAdminScope.middleware.js';
import type {
  AdminUserRepositoryPort,
  DriverApplicationRepositoryPort,
  DriverDocumentRepositoryPort,
  DriverRepositoryPort,
  KycAuditRepositoryPort,
  RiderRepositoryPort,
  SessionRepositoryPort,
  UserRepositoryPort,
  VehicleRepositoryPort,
} from './domain/index.js';
import {
  AdminLoginUseCase,
  CreateAdminDocumentPreviewUseCase,
  CreateAdminUserUseCase,
  CreateDriverApplicationUseCase,
  CreateDriverProfileUseCase,
  GetAdminUserDetailUseCase,
  GetDriverProfileUseCase,
  ListAdminUsersUseCase,
  LogoutUseCase,
  RefreshTokenUseCase,
  RegisterDriverVehicleUseCase,
  RequestOtpUseCase,
  GetDriverApplicationDetailUseCase,
  ListDriverApplicationsUseCase,
  ReviewDriverApplicationUseCase,
  StreamAdminDocumentContentUseCase,
  SubmitDriverApplicationUseCase,
  SweepDriverKycExpiryUseCase,
  UpdateDriverStatusUseCase,
  UpdateAdminUserStatusUseCase,
  UpdateAdminUserUseCase,
  UploadDriverDocumentUseCase,
  VerifyOtpUseCase,
  GetRiderDetailUseCase,
  GetRiderProfileUseCase,
  ListRidersUseCase,
  UpdateRiderProfileUseCase,
  UpdateRiderStatusUseCase,
  UpdateSelfRiderProfileUseCase,
  resolveDriverCityZoneId,
  type DriverKycExpiryNotification,
} from './application/useCases/index.js';
import {
  ConsoleSmsGatewayAdapter,
  JoseTokenAdapter,
  MemoryOtpStoreAdapter,
  MongoAdminUserRepository,
  MongoDriverApplicationRepository,
  MongoDriverDocumentRepository,
  MongoDriverRepository,
  MongoKycAuditRepository,
  MongoRiderRepository,
  MongoSessionRepository,
  MongoUserRepository,
  MongoVehicleRepository,
} from './infrastructure/index.js';
import {
  makeAdminLoginController,
  makeLogoutController,
  makeRefreshTokenController,
  makeRequestOtpController,
  makeVerifyOtpController,
} from './interface/auth.controller.js';
import { buildAuthRouter } from './interface/auth.routes.js';
import {
  makeCreateAdminDocumentPreviewController,
  makeCreateDriverApplicationController,
  makeCreateDriverProfileController,
  makeGetDriverProfileController,
  makeRegisterDriverVehicleController,
  makeRenewDriverApplicationController,
  makeGetDriverApplicationController,
  makeListDriverApplicationsController,
  makeReviewDriverApplicationController,
  makeStreamAdminDocumentContentController,
  makeSubmitDriverApplicationController,
  makeUpdateDriverStatusController,
  makeUploadDriverDocumentController,
  makeUploadDriverLicenseFileController,
  makeUploadVehicleDocumentFileController,
  makeUploadIdentityDocumentFileController,
  makeTestApproveDriverController,
} from './interface/driver.controller.js';
import { buildAdminDriverRouter, buildDriverRouter } from './interface/driver.routes.js';
import {
  makeAdminUpdateRiderProfileController,
  makeGetRiderDetailController,
  makeGetRiderProfileController,
  makeListRidersController,
  makeUpdateRiderStatusController,
  makeUpdateSelfRiderProfileController,
} from './interface/rider.controller.js';
import { buildAdminRiderRouter, buildRiderRouter } from './interface/rider.routes.js';
import {
  makeCreateAdminUserController,
  makeGetAdminRolePermissionsController,
  makeGetAdminUserDetailController,
  makeListAdminUsersController,
  makeUpdateAdminUserController,
  makeUpdateAdminUserStatusController,
} from './interface/adminUser.controller.js';
import { buildAdminUserRouter } from './interface/adminUser.routes.js';
import {
  makeAuthenticate,
  makeTokenVerifier,
  makeRequireZoneAccess,
  requireRole,
} from './interface/middlewares/index.js';
import { registerIdentitySwaggerPaths } from './interface/identity.swagger.js';
import type { RideRepositoryPort } from '../rides/rides.public.js';
import type { ZoneRepositoryPort } from '../zone/zone.public.js';

export interface IdentityContainer {
  buildAuthRouter: () => Router;
  buildDriverRouter: () => Router;
  buildAdminDriverRouter: () => Router;
  buildRiderRouter?: () => Router;
  buildAdminRiderRouter?: () => Router;
  buildAdminUserRouter?: () => Router;
  sweepKycExpiry?: SweepDriverKycExpiryUseCase;
  authenticate: ReturnType<typeof makeAuthenticate>;
  /** Token check for non-HTTP transports (WebSocket upgrade). */
  verifyToken?: ReturnType<typeof makeTokenVerifier>;
  requireRole: typeof requireRole;
  requireZoneAccess: ReturnType<typeof makeRequireZoneAccess>;
  requireAdminScope: ReturnType<typeof makeRequireAdminScope>;
}

export interface IdentityContainerDeps {
  unitOfWork?: UnitOfWorkPort;
  userRepo?: UserRepositoryPort;
  riderRepo?: RiderRepositoryPort;
  sessionRepo?: SessionRepositoryPort;
  adminRepo?: AdminUserRepositoryPort;
  driverRepo?: DriverRepositoryPort;
  applicationRepo?: DriverApplicationRepositoryPort;
  documentRepo?: DriverDocumentRepositoryPort;
  vehicleRepo?: VehicleRepositoryPort;
  auditRepo?: KycAuditRepositoryPort;
  licenseStorage?: DriverLicenseStoragePort;
  previewSigningSecret?: string;
  rideRepo?: RideRepositoryPort;
  zoneRepo?: ZoneRepositoryPort;
  tokenAdapter?: JoseTokenAdapter;
  otpStore?: OtpStorePort;
  smsGateway?: SmsGatewayPort;
  ensureDriverWallet?: (driverId: string) => Promise<void>;
  hasActiveRide?: (driverId: string) => Promise<boolean>;
  removeDriverPresence?: (driverId: string) => Promise<void>;
  notifyDriver?: (notification: DriverKycExpiryNotification) => Promise<void>;
}

export function buildIdentityContainer(deps?: IdentityContainerDeps): IdentityContainer {
  registerIdentitySwaggerPaths();
  const userRepo = deps?.userRepo ?? new MongoUserRepository();
  const riderRepo = deps?.riderRepo ?? new MongoRiderRepository();
  const sessionRepo = deps?.sessionRepo ?? new MongoSessionRepository();
  const adminRepo = deps?.adminRepo ?? new MongoAdminUserRepository();
  const driverRepo = deps?.driverRepo ?? new MongoDriverRepository();
  const applicationRepo = deps?.applicationRepo ?? new MongoDriverApplicationRepository();
  const documentRepo = deps?.documentRepo ?? new MongoDriverDocumentRepository();
  const vehicleRepo = deps?.vehicleRepo ?? new MongoVehicleRepository();
  const auditRepo = deps?.auditRepo ?? new MongoKycAuditRepository();
  const tokenAdapter = deps?.tokenAdapter ?? new JoseTokenAdapter(env.JWT_ACCESS_SECRET);
  if (
    isProdLike &&
    !allowDevShortcuts &&
    (!deps?.smsGateway ||
      deps.smsGateway instanceof ConsoleSmsGatewayAdapter ||
      deps.otpStore instanceof MemoryOtpStoreAdapter)
  ) {
    throw new Error('Live authentication requires a real SMS gateway and shared OTP storage.');
  }
  const otpStore =
    deps?.otpStore ??
    (isProdLike && !allowDevShortcuts ? new MongoOtpStoreAdapter() : new MemoryOtpStoreAdapter());
  const smsGateway = deps?.smsGateway ?? new ConsoleSmsGatewayAdapter();

  const licenseStorage =
    deps?.licenseStorage ??
    new CloudinaryDriverLicenseAdapter({
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
    });

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
    photoStorage: new CloudinaryDriverPhotoAdapter({
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
    }),
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
    documentRepo,
    vehicleRepo,
  });

  const uploadDriverDocumentUseCase = new UploadDriverDocumentUseCase({
    driverRepo,
    applicationRepo,
    documentRepo,
    licenseStorage,
  });

  const registerDriverVehicleUseCase = new RegisterDriverVehicleUseCase({
    driverRepo,
    vehicleRepo,
    applicationRepo,
    documentRepo,
  });

  const submitDriverApplicationUseCase = new SubmitDriverApplicationUseCase({
    driverRepo,
    applicationRepo,
    documentRepo,
    vehicleRepo,
  });

  const reviewDriverApplicationUseCase = new ReviewDriverApplicationUseCase({
    unitOfWork: deps?.unitOfWork ?? new MongoUnitOfWork(),
    driverRepo,
    applicationRepo,
    documentRepo,
    vehicleRepo,
    auditRepo,
    removeDriverPresence: deps?.removeDriverPresence,
  });

  const sweepKycExpiry = new SweepDriverKycExpiryUseCase({
    documentRepo,
    driverRepo,
    vehicleRepo,
    auditRepo,
    hasActiveRide: deps?.hasActiveRide,
    removeDriverPresence: deps?.removeDriverPresence,
    notifyDriver: deps?.notifyDriver,
  });

  const adminApplicationDeps = {
    applicationRepo,
    driverRepo,
    userRepo,
    vehicleRepo,
    documentRepo,
    licenseStorage,
    auditRepo,
    zoneRepo: deps?.zoneRepo,
    previewSigningSecret: deps?.previewSigningSecret ?? env.JWT_ACCESS_SECRET,
    removeDriverPresence: deps?.removeDriverPresence,
  };

  const adminRiderDeps = {
    riderRepo,
    userRepo,
    sessionRepo,
    rideRepo: deps?.rideRepo,
  };

  const listRidersUseCase = new ListRidersUseCase(adminRiderDeps);
  const getRiderDetailUseCase = new GetRiderDetailUseCase(adminRiderDeps);
  const updateRiderStatusUseCase = new UpdateRiderStatusUseCase(adminRiderDeps);
  const updateRiderProfileUseCase = new UpdateRiderProfileUseCase(adminRiderDeps);

  const riderProfileDeps = { riderRepo, userRepo };
  const getRiderProfileUseCase = new GetRiderProfileUseCase(riderProfileDeps);
  const updateSelfRiderProfileUseCase = new UpdateSelfRiderProfileUseCase(riderProfileDeps);

  const authenticate = makeAuthenticate({
    tokenVerifier: tokenAdapter,
    sessionRepo,
  });

  const requireZoneAccess = makeRequireZoneAccess({
    adminRepo,
  });

  const requireAdminScope = makeRequireAdminScope(adminRepo);

  const adminUserDeps = {
    adminUserRepo: adminRepo,
    userRepo,
    sessionRepo,
    zoneRepo: deps?.zoneRepo,
  };

  const listAdminUsersUseCase = new ListAdminUsersUseCase(adminUserDeps);
  const getAdminUserDetailUseCase = new GetAdminUserDetailUseCase(adminUserDeps);
  const createAdminUserUseCase = new CreateAdminUserUseCase(adminUserDeps);
  const updateAdminUserUseCase = new UpdateAdminUserUseCase(adminUserDeps);
  const updateAdminUserStatusUseCase = new UpdateAdminUserStatusUseCase(adminUserDeps);

  const adminLoginUseCase = new AdminLoginUseCase({
    userRepo,
    adminRepo,
    sessionRepo,
    tokenSigner: tokenAdapter,
  });

  return {
    buildAuthRouter: () =>
      buildAuthRouter({
        requestOtp: makeRequestOtpController(requestOtpUseCase),
        verifyOtp: makeVerifyOtpController(verifyOtpUseCase),
        refreshToken: makeRefreshTokenController(refreshTokenUseCase),
        logout: makeLogoutController(logoutUseCase),
        adminLogin: makeAdminLoginController(adminLoginUseCase),
        authenticate,
      }),
    buildDriverRouter: () =>
      buildDriverRouter({
        authenticate,
        createProfile: makeCreateDriverProfileController(createDriverProfileUseCase),
        getProfile: makeGetDriverProfileController(getDriverProfileUseCase),
        createApplication: makeCreateDriverApplicationController(createDriverApplicationUseCase),
        renewApplication: makeRenewDriverApplicationController(createDriverApplicationUseCase),
        uploadDocument: makeUploadDriverDocumentController(uploadDriverDocumentUseCase),
        uploadLicenseFile: makeUploadDriverLicenseFileController(uploadDriverDocumentUseCase),
        uploadVehicleDocumentFile: makeUploadVehicleDocumentFileController(uploadDriverDocumentUseCase),
        uploadIdentityDocumentFile: makeUploadIdentityDocumentFileController(uploadDriverDocumentUseCase),
        registerVehicle: makeRegisterDriverVehicleController(registerDriverVehicleUseCase),
        submitApplication: makeSubmitDriverApplicationController(submitDriverApplicationUseCase),
        testApproveApplication: allowDevShortcuts
          ? makeTestApproveDriverController({
              driverRepo,
              vehicleRepo,
              applicationRepo,
              documentRepo,
              createDriverProfileUseCase,
              createDriverApplicationUseCase,
              registerDriverVehicleUseCase,
              uploadDriverDocumentUseCase,
              ensureDriverWallet: deps?.ensureDriverWallet,
            })
          : undefined,
      }),
    buildAdminDriverRouter: () =>
      buildAdminDriverRouter({
        authenticate,
        requireAdminRole: requireAdminScope(async () => undefined),
        requireApplicationScope: requireAdminScope(async (req) => {
          const id = req.params.id;
          if (!id) return null;
          const application =
            (await applicationRepo.findById(id)) ?? (await applicationRepo.findByDriverId(id));
          if (!application) return [];
          const driver = await driverRepo.findById(application.driverId);
          const cityZoneId = await resolveDriverCityZoneId(driver, deps?.zoneRepo);
          return cityZoneId ? [cityZoneId] : null;
        }),
        reviewApplication: makeReviewDriverApplicationController(reviewDriverApplicationUseCase),
        updateDriverStatus: makeUpdateDriverStatusController(
          new UpdateDriverStatusUseCase(adminApplicationDeps),
        ),
        listApplications: makeListDriverApplicationsController(
          new ListDriverApplicationsUseCase(adminApplicationDeps),
        ),
        getApplication: makeGetDriverApplicationController(
          new GetDriverApplicationDetailUseCase(adminApplicationDeps),
        ),
        previewDocument: makeCreateAdminDocumentPreviewController(
          new CreateAdminDocumentPreviewUseCase(adminApplicationDeps),
        ),
        streamDocumentContent: makeStreamAdminDocumentContentController(
          new StreamAdminDocumentContentUseCase(adminApplicationDeps),
        ),
      }),
    buildRiderRouter: () =>
      buildRiderRouter({
        authenticate,
        requireRider: requireRole('RIDER'),
        getProfile: makeGetRiderProfileController(getRiderProfileUseCase),
        updateProfile: makeUpdateSelfRiderProfileController(updateSelfRiderProfileUseCase),
      }),
    buildAdminRiderRouter: () =>
      buildAdminRiderRouter({
        authenticate,
        requireAdminRole: requireRole('SUPER_ADMIN', 'CITY_ADMIN', 'SUPPORT_ADMIN'),
        listRiders: makeListRidersController(listRidersUseCase),
        getRider: makeGetRiderDetailController(getRiderDetailUseCase),
        updateStatus: makeUpdateRiderStatusController(updateRiderStatusUseCase),
        updateProfile: makeAdminUpdateRiderProfileController(updateRiderProfileUseCase),
      }),
    buildAdminUserRouter: () =>
      buildAdminUserRouter({
        authenticate,
        requireAdminRole: requireRole(
          'SUPER_ADMIN',
          'CITY_ADMIN',
          'SUPPORT_ADMIN',
          'FINANCE_ADMIN',
        ),
        requireSuperAdminRole: requireRole('SUPER_ADMIN'),
        listAdminUsers: makeListAdminUsersController(listAdminUsersUseCase),
        getAdminUser: makeGetAdminUserDetailController(getAdminUserDetailUseCase),
        createAdminUser: makeCreateAdminUserController(createAdminUserUseCase),
        updateAdminUser: makeUpdateAdminUserController(updateAdminUserUseCase),
        updateAdminUserStatus: makeUpdateAdminUserStatusController(updateAdminUserStatusUseCase),
        getRolePermissions: makeGetAdminRolePermissionsController(),
      }),
    sweepKycExpiry,
    authenticate,
    verifyToken: makeTokenVerifier({ tokenVerifier: tokenAdapter, sessionRepo }),
    requireRole,
    requireZoneAccess,
    requireAdminScope,
  };
}
