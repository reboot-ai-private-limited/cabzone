import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import { getRawBody } from '../../../shared/http/rawBody.js';
import { rideIdParamSchema } from './rides.validation.js';
import type { RideCallsUseCase } from '../application/useCases/rideCalls.usecase.js';

export const callStartSchema = z
  .object({
    installationId: z.string().trim().min(8).max(128).optional(),
    clientRequestId: z
      .string()
      .min(16)
      .max(100)
      .regex(/^[A-Za-z0-9-]+$/),
  })
  .strict();

export const callInstallationSchema = z
  .object({
    installationId: z.string().trim().min(8).max(128).optional(),
  })
  .strict();

const callIdSchema = rideIdParamSchema.extend({ callId: z.string().uuid() });

function auth(req: Parameters<RequestHandler>[0]) {
  if (!req.auth) throw AppError.unauthenticated();
  return req.auth;
}

function resolveInstallationId(
  bodyInstallationId: string | undefined,
  actor: ReturnType<typeof auth>,
): string {
  const id = bodyInstallationId ?? actor.deviceId;
  if (!id) {
    throw AppError.badRequest('CALL_INSTALLATION_REQUIRED: installationId is required.');
  }
  return id;
}

export function makeRideCallControllers(
  calls: RideCallsUseCase,
  consume: (userId: string) => Promise<number>,
) {
  const current: RequestHandler = asyncHandler(async (req, res) => {
    const { id } = rideIdParamSchema.parse(req.params);
    sendSuccess(req, res, { call: await calls.current(id, auth(req)) });
  });

  const start: RequestHandler = asyncHandler(async (req, res) => {
    const { id } = rideIdParamSchema.parse(req.params);
    const actor = auth(req);
    const body = callStartSchema.parse(req.body ?? {});
    const installationId = resolveInstallationId(body.installationId, actor);
    calls.requireEnabled();
    const retryAfter = await consume(actor.userId);
    if (retryAfter) {
      res.setHeader('Retry-After', retryAfter);
      throw new AppError({
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'CALL_RATE_LIMITED: Try again shortly.',
        publicDetails: { retryAfterSeconds: retryAfter },
      });
    }
    sendSuccess(
      req,
      res,
      await calls.start(id, actor, installationId, body.clientRequestId),
      'Call started',
      201,
    );
  });

  const answer: RequestHandler = asyncHandler(async (req, res) => {
    const { id, callId } = callIdSchema.parse(req.params);
    const actor = auth(req);
    const body = callInstallationSchema.parse(req.body ?? {});
    const installationId = resolveInstallationId(body.installationId, actor);
    sendSuccess(req, res, await calls.answer(id, callId, actor, installationId));
  });

  const decline: RequestHandler = asyncHandler(async (req, res) => {
    const { id, callId } = callIdSchema.parse(req.params);
    sendSuccess(req, res, await calls.decline(id, callId, auth(req)));
  });

  const end: RequestHandler = asyncHandler(async (req, res) => {
    const { id, callId } = callIdSchema.parse(req.params);
    sendSuccess(req, res, await calls.end(id, callId, auth(req)));
  });

  const token: RequestHandler = asyncHandler(async (req, res) => {
    const { id, callId } = callIdSchema.parse(req.params);
    const actor = auth(req);
    const body = callInstallationSchema.parse(req.body ?? {});
    const installationId = resolveInstallationId(body.installationId, actor);
    sendSuccess(req, res, await calls.token(id, callId, actor, installationId));
  });

  const connected: RequestHandler = asyncHandler(async (req, res) => {
    const { id, callId } = callIdSchema.parse(req.params);
    sendSuccess(req, res, await calls.confirmConnected(id, callId, auth(req)));
  });

  const endCurrent: RequestHandler = asyncHandler(async (req, res) => {
    sendSuccess(req, res, await calls.endCurrent(auth(req)));
  });

  const webhook: RequestHandler = asyncHandler(async (req, res) => {
    const body = getRawBody(req);
    if (!body) throw AppError.badRequest('Invalid voice callback body.');
    await calls.handleWebhook(body, req.get('Authorization'));
    res.status(200).json({ ok: true });
  });

  return { current, start, answer, decline, end, token, connected, endCurrent, webhook };
}
