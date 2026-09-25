import pino from 'pino';
import { env, isProduction } from '@/config/env.js';
import { getRequestId } from '@/shared/http/request-context.js';

const REDACTED_PATHS = [
  'otp',
  'start_otp',
  '*.otp',
  '*.start_otp',
  'phone',
  'masked_phone',
  '*.phone',
  '*.masked_phone',
  'token',
  'password',
  'refresh_token',
  '*.token',
  '*.password',
  '*.refresh_token',
  'req.headers.authorization',
  'headers.authorization',
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
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
            messageFormat: '{if requestId}[{requestId}] {end}{msg}',
          },
        },
      }),
});
