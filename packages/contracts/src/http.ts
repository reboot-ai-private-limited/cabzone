/**
 * The envelope every /api route returns.
 */

export interface RequestMeta {
  method: string;
  url: string;
  requestId: string;
  ip?: string;
}

export interface HttpSuccessBody<T = unknown> {
  success: true;
  statusCode: number;
  request: RequestMeta;
  message: string;
  data: T;
}

export interface HttpErrorBody {
  success: false;
  statusCode: number;
  code: string;
  request: RequestMeta;
  message: string;
  data?: unknown;
  trace?: string;
}

export type HttpBody<T = unknown> = HttpSuccessBody<T> | HttpErrorBody;

export function isHttpError<T>(body: HttpBody<T>): body is HttpErrorBody {
  return body.success === false;
}
