import { useCallback, useState, useSyncExternalStore } from 'react';

export const ACCENTS = [
  ['emerald', 'Emerald'],
  ['mint', 'Mint'],
  ['jade', 'Jade'],
  ['lime', 'Lime'],
  ['forest', 'Forest'],
] as const;

export type Accent = (typeof ACCENTS)[number][0];
export type Fill = 'solid' | 'gradient';
export type Theme = 'light' | 'dark';
export interface Look {
  accent: Accent;
  fill: Fill;
  theme: Theme | null;
}

const KEYS = { accent: 'agora-accent', fill: 'agora-fill', theme: 'agora-theme' } as const;

/* Browser storage can be missing or blocked; every access is guarded. */
const store = {
  get(k: string): string | null {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k: string, v: string): void {
    try { localStorage.setItem(k, v); } catch { /* ignore */ }
  },
};

export function readLook(): Look {
  const a = store.get(KEYS.accent);
  const f = store.get(KEYS.fill);
  const t = store.get(KEYS.theme);
  return {
    accent: ACCENTS.some(([k]) => k === a) ? (a as Accent) : 'emerald',
    fill: f === 'gradient' ? 'gradient' : 'solid',
    theme: t === 'light' || t === 'dark' ? t : null,
  };
}

/** Writes the look onto <html>. Called synchronously so canvas colour reads see it at once. */
export function applyLook(look: Look): void {
  const r = document.documentElement;
  if (look.accent === 'emerald') r.removeAttribute('data-accent');
  else r.setAttribute('data-accent', look.accent);
  if (look.fill === 'gradient') r.setAttribute('data-fill', 'gradient');
  else r.removeAttribute('data-fill');
  if (look.theme) r.setAttribute('data-theme', look.theme);
  else r.removeAttribute('data-theme');
}

export function useLook() {
  const [look, setLook] = useState<Look>(readLook);

  const update = useCallback((patch: Partial<Look>) => {
    setLook((prev) => {
      const next = { ...prev, ...patch };
      applyLook(next);
      store.set(KEYS.accent, next.accent);
      store.set(KEYS.fill, next.fill);
      if (next.theme) store.set(KEYS.theme, next.theme);
      return next;
    });
  }, []);

  const toggleTheme = useCallback(() => {
    const current = look.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    update({ theme: current === 'dark' ? 'light' : 'dark' });
  }, [look.theme, update]);

  return { look, update, toggleTheme };
}

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
