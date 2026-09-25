import type { Router } from 'express';
import { env } from '@/config/env.js';
import {
  LogoutUseCase,
  RefreshTokenUseCase,
  RequestOtpUseCase,
  VerifyOtpUseCase,
} from './application/useCases/index.js';
import {
  ConsoleSmsGatewayAdapter,
  JoseTokenAdapter,
  MemoryOtpStoreAdapter,
  MongoAdminUserRepository,
  MongoRiderRepository,
  MongoSessionRepository,
  MongoUserRepository,
} from './infrastructure/index.js';
import {
  makeLogoutController,
  makeRefreshTokenController,
  makeRequestOtpController,
  makeVerifyOtpController,
} from './interface/auth.controller.js';
import { buildAuthRouter } from './interface/auth.routes.js';
import {
  makeAuthenticate,
  makeRequireZoneAccess,
  requireRole,
} from './interface/middlewares/index.js';

export interface IdentityContainer {
  buildAuthRouter: () => Router;
  authenticate: ReturnType<typeof makeAuthenticate>;
  requireRole: typeof requireRole;
  requireZoneAccess: ReturnType<typeof makeRequireZoneAccess>;
}

export interface IdentityContainerDeps {
  userRepo?: MongoUserRepository;
  riderRepo?: MongoRiderRepository;
  sessionRepo?: MongoSessionRepository;
  adminRepo?: MongoAdminUserRepository;
  tokenAdapter?: JoseTokenAdapter;
  otpStore?: MemoryOtpStoreAdapter;
  smsGateway?: ConsoleSmsGatewayAdapter;
}

export function buildIdentityContainer(deps?: IdentityContainerDeps): IdentityContainer {
  const userRepo = deps?.userRepo ?? new MongoUserRepository();
  const riderRepo = deps?.riderRepo ?? new MongoRiderRepository();
  const sessionRepo = deps?.sessionRepo ?? new MongoSessionRepository();
  const adminRepo = deps?.adminRepo ?? new MongoAdminUserRepository();
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
  });

  const refreshTokenUseCase = new RefreshTokenUseCase({
    sessionRepo,
    tokenSigner: tokenAdapter,
  });

  const logoutUseCase = new LogoutUseCase({
    sessionRepo,
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
    authenticate,
    requireRole,
    requireZoneAccess,
  };
}
