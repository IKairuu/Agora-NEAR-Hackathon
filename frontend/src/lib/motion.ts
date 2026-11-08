import { useSyncExternalStore } from 'react';

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(REDUCE_QUERY);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => matchMedia(REDUCE_QUERY).matches,
    () => false,
  );
}
