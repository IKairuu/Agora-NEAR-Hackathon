const PATHS = {
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6 6 18',
  warn: 'M12 3 2 20h20zM12 10v4M12 17v.5',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  play: 'M7 4v16l13-8z',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5 5 3.5 3.5M20.5 20.5 19 19M5 19l-1.5 1.5M20.5 3.5 19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  swatch:
    'M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 21 9.7C21 6 17 3 12 3ZM7.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm3-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
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

export function Brand() {
  return (
    <a className="brand" href="#top">
      <span className="brand-mark"><Logo /></span>
      <span className="brand-name">AGORA</span>
    </a>
  );
}
