'use client';

import type { QuoteDto } from '@cabzone/contracts';
import { quotesApi, type SimulateQuoteInput } from '@/lib/api/endpoints/quotes.js';
import { useApiMutation } from '@/lib/query/mutation.js';

export function useSimulateQuote(
  onSuccess?: (quote: QuoteDto, variables: SimulateQuoteInput) => void,
  onError?: (error: unknown, variables: SimulateQuoteInput) => void,
) {
  return useApiMutation<SimulateQuoteInput, QuoteDto>({
    call: (token, body) => quotesApi.simulate(body, token),
    ...(onSuccess !== undefined ? { onSuccess } : {}),
    ...(onError !== undefined ? { onError } : {}),
  });
}
