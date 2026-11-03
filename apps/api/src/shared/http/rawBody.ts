import type { Request } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

export const RAW_BODY_ROUTES = ['/payments/webhook', '/rides/payment/upi/webhook', '/rides/calls/webhook', '/wallet/webhook'] as const;

export function shouldCaptureRawBody(url: string | undefined): boolean {
  if (url === undefined) return false;
  const path = url.split('?')[0] ?? url;
  return RAW_BODY_ROUTES.some((route) => path.endsWith(route));
}

export function getRawBody(req: Request): string | undefined {
  return req.rawBody;
}
