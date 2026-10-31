import type { RequestHandler, Router } from 'express';
import type { AuthRole } from '@cabzone/contracts';
import type { UnitOfWorkPort } from '../../shared/db/unitOfWork.port.js';
import {
  MemoryPaymentRepository,
  type PaymentRepositoryPort,
  type WalletRepositoryPort,
} from '../ledger/ledger.public.js';
import type { PricingConfigRepositoryPort } from '../pricing/pricing.public.js';
import { AcceptRideUseCase } from './application/useCases/acceptRide.usecase.js';
import { CancelRideUseCase } from './application/useCases/cancelRide.usecase.js';
import { CompleteRideUseCase } from './application/useCases/completeRide.usecase.js';
import { CreateRideUseCase } from './application/useCases/createRide.usecase.js';
import { DriverArrivedUseCase } from './application/useCases/driverArrived.usecase.js';
import { DriverEarningsUseCase } from './application/useCases/driverEarnings.usecase.js';
import { DriverEnRouteUseCase } from './application/useCases/driverEnRoute.usecase.js';
import { StartRideUseCase } from './application/useCases/startRide.usecase.js';
import { NegotiateFareUseCase } from './application/useCases/negotiateFare.usecase.js';
import { RideRatingsUseCase } from './application/useCases/rideRatings.usecase.js';
import type {
  ProfileRatingApplierPort,
  RideEventRepositoryPort,
  RideEntity,
  RideNotifierPort,
  RideRepositoryPort,
  RideReviewRepositoryPort,
} from './domain/index.js';
import type { RidePaymentGateway } from './domain/ridePayment.port.js';
import { ExpireOffersUseCase } from './application/useCases/expireOffers.usecase.js';
import {
  makeAcceptRideController,
  makeCancelRideController,
  makeClaimCashPaidController,
  makeCompleteRideController,
  makeDisputePaymentController,
  makeMarkRideUnpaidController,
  makeResolvePaymentDisputeController,
  makeListPaymentDisputesController,
  makeCreateRideController,
  makeDriverArrivedController,
  makeDriverCounterController,
  makeDriverEarningsSummaryController,
  makeDriverHistoryController,
  makeReconcileDriverEarningsController,
  makeRespondCounterController,
  makeRaiseFareController,
  makeDriverEnRouteController,
  makeGetRideController,
  makeGetRideCommunicationController,
  makeGetRideRatingController,
  makeListRidesController,
  makeRideEventsController,
  makeStartRideController,
  makeSubmitRideRatingController,
  makeWaiveCancellationFeeController,
  type RideHttpContext,
} from './interface/rides.controller.js';
import { buildRidesRouter } from './interface/rides.routes.js';
import { registerRidesSwaggerPaths } from './interface/rides.swagger.js';
import { RideUpiPaymentUseCase } from './application/useCases/rideUpiPayment.usecase.js';
import {
  makeRideUpiController,
  makeSwitchToCashController,
} from './interface/rideUpiPayment.controller.js';
import { makeRideUpiWebhook } from './interface/rideUpiWebhook.controller.js';
import { RazorpayGateway } from './infrastructure/razorpay.adapter.js';
import {
  MockQrPaymentGateway,
  RazorpayQrGateway,
} from './infrastructure/razorpayQr.gateway.js';
import type { QrPaymentGatewayPort } from './domain/qrPaymentGateway.port.js';
import { RideQrPaymentUseCase } from './application/useCases/rideQrPayment.usecase.js';
import { MemoryRideReviewRepository } from './infrastructure/persistence/memoryRideReview.repository.js';
import { env, isProduction } from '../../config/env.js';
import { RidePaymentQrAdapter } from './infrastructure/ridePaymentQr.adapter.js';
import { makeRidePaymentQrControllers } from './interface/ridePaymentQr.controller.js';
import {
  RideExtensionsUseCase,
  type RideExtensionsDeps,
} from './application/useCases/rideExtensions.usecase.js';
import { makeExtensionControllers } from './interface/rideExtensions.controller.js';
import { RideCommunicationAccessUseCase, type RideCommunicationAccessDeps } from './application/useCases/rideCommunicationAccess.usecase.js';
import type { RideChatMessageDto } from '@cabzone/contracts';
import type { RideChatRepositoryPort } from './domain/rideChat.port.js';
import { MemoryRideChatRepository } from './infrastructure/persistence/memoryRideChat.repository.js';
import { RideChatUseCase } from './application/useCases/rideChat.usecase.js';
import { makeChatControllers } from './interface/rideChat.controller.js';
import { AppError } from '../../shared/errors/AppError.js';
import type { RideCallPushPort, RideCallRepositoryPort, RideVoiceProviderPort } from './domain/rideCall.port.js';
import { MemoryRideCallRepository } from './infrastructure/persistence/memoryRideCall.repository.js';
import { RideCallsUseCase } from './application/useCases/rideCalls.usecase.js';
import { makeRideCallControllers } from './interface/rideCalls.controller.js';
import { LiveKitVoiceGateway } from './infrastructure/liveKitVoice.gateway.js';

export interface RidesContainerDeps extends RideHttpContext {
  chatEnabled?: boolean;
  chatMessages?: RideChatRepositoryPort;
  consumeChatRateLimit?: (userId: string) => Promise<number>;
  notifyChat?: (ride: RideEntity, message: RideChatMessageDto) => Promise<void>;
  callsEnabled?: boolean | undefined;
  providerUrl?: string | undefined;
  callRecords?: RideCallRepositoryPort | undefined;
  voiceProvider?: RideVoiceProviderPort | undefined;
  isInstallationRegistered?: ((userId: string, installationId: string) => Promise<boolean>) | undefined;
  requireRegisteredInstallation?: boolean | undefined;
  getCallerDisplayName?: ((ride: RideEntity, callerRole: 'RIDER' | 'DRIVER') => Promise<string>) | undefined;
  notifyCall?: RideCallPushPort['notify'] | undefined;
  consumeCallRateLimit?: ((userId: string) => Promise<number>) | undefined;
  getUserIdForRider?: (riderId: string) => Promise<string | null>;
  getUserIdForDriver?: (driverId: string) => Promise<string | null>;
  isCommunicationAccountActive?: RideCommunicationAccessDeps['isCommunicationAccountActive'];
  extensions?: Pick<RideExtensionsDeps, 'routing' | 'getDriverLocation' | 'classify'>;
  unitOfWork: UnitOfWorkPort;
  rideRepo: RideRepositoryPort;
  rideEventRepo: RideEventRepositoryPort;
  rideReviewRepo?: RideReviewRepositoryPort | undefined;
  applyRevealedProfileRating?: ProfileRatingApplierPort | undefined;
  ratingClock?: (() => Date) | undefined;
  walletRepo: WalletRepositoryPort;
  pricingConfigRepo: PricingConfigRepositoryPort;
  tokenSecret: string;
  requireDriverEligibility: (driverId: string, ride: RideEntity) => Promise<string>;
  notifier?: RideNotifierPort | undefined;
  /** Secret used to derive rider-visible pickup OTPs. */
  pickupOtpSecret?: string | undefined;
  ridePaymentGateway?: RidePaymentGateway | undefined;
  qrPaymentGateway?: QrPaymentGatewayPort | undefined;
  paymentRepo?: PaymentRepositoryPort | undefined;
}

export interface RidesContainerAuth {
  authenticate: RequestHandler;
  requireRole: (...roles: AuthRole[]) => RequestHandler;
}

export interface RidesContainer {
  communicationAccess: RideCommunicationAccessUseCase;
  rideCalls: RideCallsUseCase;
  rideRepo: RideRepositoryPort;
  rideReviewRepo: RideReviewRepositoryPort;
  createRideUseCase: CreateRideUseCase;
  acceptRideUseCase: AcceptRideUseCase;
  driverEnRouteUseCase: DriverEnRouteUseCase;
  driverArrivedUseCase: DriverArrivedUseCase;
  startRideUseCase: StartRideUseCase;
  completeRideUseCase: CompleteRideUseCase;
  cancelRideUseCase: CancelRideUseCase;
  expireOffersUseCase: ExpireOffersUseCase;
  rideRatingsUseCase: RideRatingsUseCase;
  driverEarningsUseCase: DriverEarningsUseCase;
  buildRidesRouter: (auth: RidesContainerAuth) => Router;
}

const ADMIN_ROLES: AuthRole[] = ['SUPER_ADMIN', 'CITY_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'];

export function buildRidesContainer(deps: RidesContainerDeps): RidesContainer {
  registerRidesSwaggerPaths();
  const { rideRepo, rideEventRepo, walletRepo } = deps;
  const communicationAccess = new RideCommunicationAccessUseCase({
    rideRepo,
    resolveRiderId: deps.resolveRiderId,
    resolveDriverId: deps.resolveDriverId,
    // Missing identity wiring must never grant communication access.
    isCommunicationAccountActive: deps.isCommunicationAccountActive ?? (async () => false),
  });
  const rideReviewRepo = deps.rideReviewRepo ?? new MemoryRideReviewRepository();
  const chat = new RideChatUseCase({
    access: communicationAccess,
    rideRepo,
    messages: deps.chatMessages ?? new MemoryRideChatRepository(),
    unitOfWork: deps.unitOfWork,
    chatEnabled: deps.chatEnabled ?? env.RIDE_CHAT_ENABLED,
    notify: deps.notifyChat,
  });
  const chatControllers = makeChatControllers(chat, deps.consumeChatRateLimit ?? (async () => {
    throw AppError.internal('INTERNAL', 'Chat rate-limit store is not configured');
  }));
  const rideCalls = new RideCallsUseCase({
    access: communicationAccess,
    rideRepo,
    calls: deps.callRecords ?? new MemoryRideCallRepository(),
    unitOfWork: deps.unitOfWork,
    provider: deps.voiceProvider ?? new LiveKitVoiceGateway(
      env.LIVEKIT_URL ?? '', env.LIVEKIT_API_KEY ?? '', env.LIVEKIT_API_SECRET ?? '',
    ),
    providerUrl: deps.providerUrl ?? env.LIVEKIT_URL ?? '',
    enabled: deps.callsEnabled ?? env.RIDE_CALL_ENABLED,
    getUserIdForRider: deps.getUserIdForRider ?? (async () => null),
    getUserIdForDriver: deps.getUserIdForDriver ?? (async () => null),
    getCallerDisplayName: deps.getCallerDisplayName,
    isInstallationRegistered: deps.isInstallationRegistered ?? (async () => false),
    requireRegisteredInstallation: deps.requireRegisteredInstallation,
    push: { notify: deps.notifyCall ?? (async () => undefined) },
  });
  const callControllers = makeRideCallControllers(rideCalls, deps.consumeCallRateLimit ?? (async () => {
    throw AppError.internal('INTERNAL', 'Call rate-limit store is not configured');
  }));
  const applyRevealedProfileRating: ProfileRatingApplierPort =
    deps.applyRevealedProfileRating ?? (async () => undefined);

  const gatewayEnabled = !isProduction || env.RAZORPAY_MODE === 'live';
  const defaultGatewayConfigured = Boolean(
    gatewayEnabled &&
    env.RAZORPAY_KEY_ID?.startsWith(`rzp_${env.RAZORPAY_MODE}_`) &&
    env.RAZORPAY_KEY_SECRET,
  );
  const gateway =
    deps.ridePaymentGateway ??
    new RazorpayGateway(
      env.RAZORPAY_KEY_ID ?? '',
      env.RAZORPAY_KEY_SECRET ?? '',
      gatewayEnabled,
      env.RAZORPAY_MODE,
    );
  const paymentRepo = deps.paymentRepo ?? new MemoryPaymentRepository();
  const hasRazorpayQrKeys = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  const qrGateway =
    deps.qrPaymentGateway ??
    (hasRazorpayQrKeys
      ? new RazorpayQrGateway(env.RAZORPAY_KEY_ID!, env.RAZORPAY_KEY_SECRET!)
      : new MockQrPaymentGateway(isProduction));
  const qrPayment = new RideQrPaymentUseCase({
    rideRepo,
    rideEventRepo,
    paymentRepo,
    walletRepo,
    unitOfWork: deps.unitOfWork,
    gateway: qrGateway,
    onRideSettled: async (ride, event) => {
      await deps.notifier?.rideUpdated(ride, event);
    },
  });
  const upiPayment = new RideUpiPaymentUseCase({
    walletRepo,
    rideRepo,
    rideEventRepo,
    unitOfWork: deps.unitOfWork,
    gateway,
    closeQrCollectionForCash: (rideId) => qrPayment.closeForCash(rideId),
  });

  const createRideUseCase = new CreateRideUseCase({
    unitOfWork: deps.unitOfWork,
    rideEventRepo,
    rideRepo,
    pricingConfigRepo: deps.pricingConfigRepo,
    walletRepo,
    tokenSecret: deps.tokenSecret,
  });
  const acceptRideUseCase = new AcceptRideUseCase({
    unitOfWork: deps.unitOfWork,
    rideEventRepo,
    rideRepo,
    walletRepo,
    otpSecret: deps.pickupOtpSecret,
    requireDriverEligibility: deps.requireDriverEligibility,
  });
  const negotiateFareUseCase = new NegotiateFareUseCase({
    rideRepo,
    rideEventRepo,
    unitOfWork: deps.unitOfWork,
    acceptRide: acceptRideUseCase,
    requireDriverEligibility: deps.requireDriverEligibility,
  });
  const driverEnRouteUseCase = new DriverEnRouteUseCase({
    rideRepo,
    rideEventRepo,
    unitOfWork: deps.unitOfWork,
  });
  const driverArrivedUseCase = new DriverArrivedUseCase({
    rideRepo,
    rideEventRepo,
    unitOfWork: deps.unitOfWork,
  });
  const startRideUseCase = new StartRideUseCase({
    unitOfWork: deps.unitOfWork,
    rideEventRepo,
    rideRepo,
  });
  const completeRideUseCase = new CompleteRideUseCase({
    refundVerifier: gateway.fetchRefund
      ? { fetchRefund: (id) => gateway.fetchRefund!(id) }
      : undefined,
    prepareCashConfirmation: (rideId, driverId) =>
      upiPayment.prepareCashConfirmation(rideId, driverId),
    prepareNonUpiResolution: (rideId) => upiPayment.prepareNonUpiResolution(rideId),
    rideRepo,
    walletRepo,
    rideEventRepo,
    unitOfWork: deps.unitOfWork,
    onRideCompleted: (rideId) => rideCalls.endForRide(rideId, 'ride_completed'),
  });
  const cancelRideUseCase = new CancelRideUseCase({
    rideRepo,
    walletRepo,
    rideEventRepo,
    unitOfWork: deps.unitOfWork,
    onRideCancelled: (rideId) => rideCalls.endForRide(rideId, 'ride_cancelled'),
  });
  const reconciliationGateway = deps.ridePaymentGateway
    ? deps.ridePaymentGateway
    : defaultGatewayConfigured
      ? gateway
      : undefined;
  const driverEarningsUseCase = new DriverEarningsUseCase({
    rideRepo,
    rideEventRepo,
    walletRepo,
    unitOfWork: deps.unitOfWork,
    gateway: reconciliationGateway,
    reconcileOnlineRide: (rideId, riderId) => upiPayment.reconcile(rideId, riderId),
  });

  const expireOffersUseCase = new ExpireOffersUseCase({
    unitOfWork: deps.unitOfWork,
    rideRepo,
    rideEventRepo,
    notifier: deps.notifier,
  });

  const rideRatingsUseCase = new RideRatingsUseCase({
    unitOfWork: deps.unitOfWork,
    rideRepo,
    rideEventRepo,
    reviewRepo: rideReviewRepo,
    applyRevealedProfileRating,
    now: deps.ratingClock,
  });

  const actors: RideHttpContext = {
    resolveRiderId: deps.resolveRiderId,
    resolveDriverId: deps.resolveDriverId,
    resolveAssignedDriver: deps.resolveAssignedDriver,
    notifier: deps.notifier,
    pickupOtpSecret: deps.pickupOtpSecret,
  };
  const qrControllers = makeRidePaymentQrControllers({
    rideRepo,
    payment: upiPayment,
    qr: new RidePaymentQrAdapter(deps.tokenSecret),
    actors,
    qrPayment,
  });
  const extensionControllers = makeExtensionControllers(
    deps.extensions
      ? new RideExtensionsUseCase({
          ...deps.extensions,
          rideRepo,
          rideEventRepo,
          unitOfWork: deps.unitOfWork,
        })
      : null,
    actors,
  );

  return {
    rideRepo,
    communicationAccess,
    rideCalls,
    rideReviewRepo,
    createRideUseCase,
    acceptRideUseCase,
    driverEnRouteUseCase,
    driverArrivedUseCase,
    startRideUseCase,
    completeRideUseCase,
    cancelRideUseCase,
    expireOffersUseCase,
    rideRatingsUseCase,
    driverEarningsUseCase,
    buildRidesRouter: (auth) =>
      buildRidesRouter({
        authenticate: auth.authenticate,
        requireRider: auth.requireRole('RIDER'),
        requireDriver: auth.requireRole('DRIVER'),
        requireParticipant: auth.requireRole('RIDER', 'DRIVER'),
        requireCanRead: auth.requireRole('RIDER', 'DRIVER', ...ADMIN_ROLES),
        requireDisputeAdmin: auth.requireRole('SUPER_ADMIN', 'SUPPORT_ADMIN'),
        requireWaiverAdmin: auth.requireRole('SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'),
        requireDisputeReadAdmin: auth.requireRole('SUPER_ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN'),
        requireFinanceAdmin: auth.requireRole('SUPER_ADMIN', 'FINANCE_ADMIN'),
        requireCanCancel: auth.requireRole(
          'RIDER',
          'DRIVER',
          'SUPER_ADMIN',
          'CITY_ADMIN',
          'SUPPORT_ADMIN',
        ),
        createRide: makeCreateRideController(createRideUseCase, actors),
        proposeExtension: extensionControllers.propose,
        respondExtension: extensionControllers.respond,
        listRides: makeListRidesController(rideRepo, actors),
        driverEarnings: makeDriverEarningsSummaryController(driverEarningsUseCase, actors),
        driverHistory: makeDriverHistoryController(rideRepo, driverEarningsUseCase, actors),
        reconcileDriverEarnings: makeReconcileDriverEarningsController(driverEarningsUseCase),
        getRide: makeGetRideController(rideRepo, actors, rideEventRepo, driverEarningsUseCase),
        getCommunication: makeGetRideCommunicationController(communicationAccess),
        listMessages: chatControllers.list,
        sendMessage: chatControllers.send,
        currentCall: callControllers.current,
        startCall: callControllers.start,
        answerCall: callControllers.answer,
        declineCall: callControllers.decline,
        endCall: callControllers.end,
        callToken: callControllers.token,
        confirmCallConnected: callControllers.connected,
        endCurrentCall: callControllers.endCurrent,
        callWebhook: callControllers.webhook,
        getRideEvents: makeRideEventsController(rideRepo, rideEventRepo, actors),
        getRideRating: makeGetRideRatingController(rideRepo, rideRatingsUseCase, actors),
        submitRideRating: makeSubmitRideRatingController(rideRepo, rideRatingsUseCase, actors),
        acceptRide: makeAcceptRideController(acceptRideUseCase, actors),
        driverCounter: makeDriverCounterController(negotiateFareUseCase, actors),
        respondCounter: makeRespondCounterController(negotiateFareUseCase, actors),
        raiseFare: makeRaiseFareController(negotiateFareUseCase, actors),
        driverEnRoute: makeDriverEnRouteController(driverEnRouteUseCase, actors),
        driverArrived: makeDriverArrivedController(driverArrivedUseCase, actors),
        startRide: makeStartRideController(startRideUseCase, actors),
        completeRide: makeCompleteRideController(completeRideUseCase, actors),
        confirmPayment: makeCompleteRideController(completeRideUseCase, actors, true),
        claimCashPaid: makeClaimCashPaidController(completeRideUseCase, actors),
        markRideUnpaid: makeMarkRideUnpaidController(completeRideUseCase, actors),
        createUpiPayment: makeRideUpiController(upiPayment, actors, 'create'),
        upiSession: makeRideUpiController(upiPayment, actors, 'session'),
        switchToCash: makeSwitchToCashController(upiPayment, actors, rideRepo),
        upiWebhook: makeRideUpiWebhook(
          upiPayment,
          actors,
          env.RAZORPAY_WEBHOOK_SECRET,
          qrPayment,
        ),
        verifyUpiPayment: makeRideUpiController(upiPayment, actors, 'verify'),
        upiPaymentStatus: makeRideUpiController(upiPayment, actors, 'status'),
        driverPaymentQr: qrControllers.driverQr,
        driverPaymentStatus: qrControllers.driverStatus,
        driverCreatePaymentQr: qrControllers.driverCreatePaymentQr,
        driverPollPaymentQr: qrControllers.driverPollPaymentQr,
        checkoutPage: qrControllers.page,
        checkoutSession: qrControllers.session,
        checkoutVerify: qrControllers.verify,
        checkoutStatus: qrControllers.status,
        disputePayment: makeDisputePaymentController(completeRideUseCase, actors),
        resolvePaymentDispute: makeResolvePaymentDisputeController(completeRideUseCase, actors),
        listPaymentDisputes: makeListPaymentDisputesController(
          rideRepo,
          rideEventRepo,
          actors,
          walletRepo,
        ),
        cancelRide: makeCancelRideController(cancelRideUseCase, actors, rideRepo),
        waiveCancellationFee: makeWaiveCancellationFeeController(cancelRideUseCase, actors),
      }),
  };
}
