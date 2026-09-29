'use client';

import { zonesApi } from '@/lib/api/endpoints/zones';
import { keys } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** Permanently delete a zone. Not optimistic: a row that reappears on failure misleads. */
export function useDeleteZone() {
  return useApiMutation<string, unknown>({
    call: (token, id) => zonesApi.remove(token, id),
    invalidates: [keys.zones.all()],
    successMessage: 'Zone deleted.',
  });
}
