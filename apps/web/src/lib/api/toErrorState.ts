import { ApiError } from './ApiError.js';

export interface ErrorStateData {
  message: string;
  requestId?: string;
  onRetry?: () => void;
  title?: string;
}

export function toErrorState(error: unknown, onRetry?: () => void): ErrorStateData {
  if (error instanceof ApiError) {
    return {
      title: 'Request failed',
      message: error.message || 'An unexpected error occurred.',
      requestId: error.requestId,
      onRetry,
    };
  }

  if (error instanceof Error) {
    return {
      title: 'Error',
      message: error.message,
      onRetry,
    };
  }

  return {
    title: 'Error',
    message: 'An unexpected error occurred.',
    onRetry,
  };
}
