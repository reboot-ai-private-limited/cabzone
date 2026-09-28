import type { FaultCode, HttpErrorBody } from '@Cabzone/contracts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: FaultCode;
  readonly requestId: string;
  readonly data: unknown;

  constructor(body: HttpErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = body.statusCode;
    this.code = body.code as FaultCode;
    this.requestId = body.request.requestId;
    this.data = body.data;
  }

  get isRetryable(): boolean {
    return this.status >= 500;
  }
}

export class NetworkError extends Error {
  constructor() {
    super('Could not reach the server. Check your connection and try again.');
    this.name = 'NetworkError';
  }
}
