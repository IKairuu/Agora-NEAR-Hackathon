import { Link } from 'react-router';

const PATHS = {
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6 6 18',
  warn: 'M12 3 2 20h20zM12 10v4M12 17v.5',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  play: 'M7 4v16l13-8z',
  up: 'M12 19V5M5 12l7-7 7 7',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  brief: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18',
  code: 'm8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16',
  bot: 'M5 9h14v10H5zM12 5v4M9 14h.01M15 14h.01M3 13v2M21 13v2',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10',
  cube: 'M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  window: 'M3 5h18v14H3zM3 9h18M7 7h.01M10 7h.01',
  term: 'M3 5h18v14H3zM7 10l3 2-3 2M13 15h4',
  layers: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5',
  repo: 'M6 3h12v18l-6-4-6 4zM9 8h6',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6zM9 12l2 2 4-4',
  gift: 'M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'ic' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The AGORA mark: one looping stroke forming an A, ending in a node. Same drawing as public/logo.svg. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="agora-logo-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#11231a" />
          <stop offset="1" stopColor="#08120c" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="23" fill="url(#agora-logo-tile)" />
      <g fill="none" stroke="#86bd90" strokeWidth={5.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M66.5 43 L77 68.5" />
        <path d="M50 36.3 L31.6 73.4 C29.5 77.6 24.6 79.6 20.8 77.2 C17.3 75 16.7 70.6 19.4 67 C23.5 61 31 58.2 41.5 57.2 C50 56.4 58 55.5 63 51 C66.5 48 67.2 43.5 65.4 39.5 L60.8 28.8 C58.5 24 54.8 21.4 50 21.4 C45.2 21.4 41.8 24.2 39.8 28 L19.4 67" />
        <circle cx="80" cy="74.8" r="4.5" strokeWidth={3.8} />
      </g>
    </svg>
  );
}

export function GoogleIcon() {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="var(--color-g-blue)" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="var(--color-g-green)" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
      <path fill="var(--color-g-yellow)" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z" />
      <path fill="var(--color-g-red)" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 5.9 12 5.9z" />
    </svg>
  );
}

/** Round status mark used in check rows. */
export function Mark({ kind }: { kind: 'ok' | 'hold' }) {
  return (
    <span className={`m ${kind}`}>
      <Icon name={kind === 'hold' ? 'warn' : 'check'} />
    </span>
  );
}

/** Wordmark. On the landing page it scrolls to the top; elsewhere it links home. */
export function Brand({ to }: { to?: string }) {
  const inner = (
    <>
      <span className="brand-mark"><Logo /></span>
      <span className="brand-name">AGORA</span>
    </>
  );
  return to ? <Link className="brand" to={to}>{inner}</Link> : <a className="brand" href="#top">{inner}</a>;
}
