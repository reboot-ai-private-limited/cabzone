import pino from 'pino';
import { env, isDevelopment } from '@/config/env.js';
import { getRequestId } from '@/shared/http/request-context.js';

export const REDACTED_PATHS = [
  'otp',
  'start_otp',
  '*.otp',
  '*.start_otp',
  'phone',
  'phoneE164',
  'masked_phone',
  '*.phone',
  '*.phoneE164',
  '*.masked_phone',
  'token',
  'pushToken',
  'password',
  'refresh_token',
  'apiKey',
  'apiSecret',
  'authKey',
  'authToken',
  'secret',
  'sig',
  '*.token',
  '*.pushToken',
  '*.password',
  '*.refresh_token',
  '*.apiKey',
  '*.apiSecret',
  '*.authKey',
  '*.authToken',
  '*.secret',
  '*.sig',
  'req.headers.authorization',
  'headers.authorization',
  'req.headers.cookie',
  'headers.cookie',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: REDACTED_PATHS,
    censor: '[redacted]',
  },
  mixin() {
    const requestId = getRequestId();
    return requestId === undefined ? {} : { requestId };
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
            messageFormat: '{if requestId}[{requestId}] {end}{msg}',
          },
        },
      }
    : {}),
});
