import { z } from 'zod';
import type { RequestHandler } from 'express';
import { RIDE_CHAT_PAGE_SIZE } from '@cabzone/contracts';
import { AppError } from '../../../shared/errors/AppError.js';
import { asyncHandler } from '../../../shared/http/asyncHandler.js';
import { sendSuccess } from '../../../shared/http/response.util.js';
import { rideIdParamSchema } from './rides.validation.js';
import type { RideChatUseCase } from '../application/useCases/rideChat.usecase.js';

export const chatSendSchema = z
  .object({
    clientMessageId: z
      .string()
      .min(16)
      .max(100)
      .regex(/^[A-Za-z0-9-]+$/),
    text: z.string().max(1200),
  })
  .strict();

export const chatQuerySchema = z
  .object({
    before: z.coerce.number().int().positive().safe().optional(),
    after: z.coerce.number().int().nonnegative().safe().optional(),
    limit: z.coerce.number().int().min(1).max(RIDE_CHAT_PAGE_SIZE).default(RIDE_CHAT_PAGE_SIZE),
  })
  .strict()
  .refine((q) => q.before === undefined || q.after === undefined, 'Choose before or after');

export function makeChatControllers(chat: RideChatUseCase, consume: (userId: string) => Promise<number>) {
  const list: RequestHandler = asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthenticated();
    const { id } = rideIdParamSchema.parse(req.params);
    sendSuccess(req, res, await chat.list(id, req.auth, chatQuerySchema.parse(req.query)));
  });
  const send: RequestHandler = asyncHandler(async (req, res) => {
    if (!req.auth) throw AppError.unauthenticated();
    const { id } = rideIdParamSchema.parse(req.params);
    const body = chatSendSchema.parse(req.body);
    chat.assertEnabled();
    const retryAfter = await consume(req.auth.userId);
    if (retryAfter) {
      res.setHeader('Retry-After', retryAfter);
      throw new AppError({
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'COMMUNICATION_RATE_LIMITED: Too many messages. Try again shortly.',
        publicDetails: { retryAfterSeconds: retryAfter },
      });
    }
    sendSuccess(req, res, await chat.send(id, req.auth, body.clientMessageId, body.text), 'Message saved', 201);
  });
  return { list, send };
}
