'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export function useFilterParams<T extends string>() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const get = useCallback(
    (key: T): string | null => {
      return searchParams ? searchParams.get(key) : null;
    },
    [searchParams],
  );

  const set = useCallback(
    (updates: Partial<Record<T, string | undefined>>) => {
      const next = new URLSearchParams(searchParams ? searchParams.toString() : '');
      for (const [k, v] of Object.entries(updates)) {
        if (v === undefined || v === null || v === '') {
          next.delete(k);
        } else {
          next.set(k, String(v));
        }
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  return { get, set };
}
