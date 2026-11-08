import { LOGO_PATH } from './logoPath';

/** Icon paths from the prototype (24x24, stroke 1.7). */
const I = {
  explore: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  home: 'M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  post: 'M12 5v14M5 12h14',
  job: 'M4 7h16v12H4zM9 7V5h6v2',
  room: 'M5 11V8a7 7 0 0 1 14 0v3M4 11h16v10H4zM12 15v2',
  agents: 'M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM4 21a8 8 0 0 1 16 0',
  mandate: 'M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z',
  wallet: 'M3 7h18v12H3zM3 7l3-3h12M16 13h2',
  dao: 'M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6z',
  seller: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  profile: 'M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17l-5.9 3 1.2-6.5L2.5 8.9 9.1 8z',
  play: 'M7 4v16l13-8z',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6 6 18',
  warn: 'M12 3 2 20h20zM12 10v4M12 17v.5',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  pause: 'M8 5v14M16 5v14',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5 5 3.5 3.5M20.5 20.5 19 19M5 19l-1.5 1.5M20.5 3.5 19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  chat: 'M4 5h16v11H9l-5 4z',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M5 12l7 7 7-7',
  store: 'M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6',
  out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  plus: 'M12 5v14M5 12h14',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  code: 'm8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10',
  cube: 'M12 3 4 7.5v9L12 21l8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  window: 'M3 5h18v14H3zM3 9h18M7 7h.01M10 7h.01',
  term: 'M3 5h18v14H3zM7 10l3 2-3 2M13 15h4',
  layers: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3Z',
  gift: 'M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1',
  bot: 'M5 9h14v10H5zM12 5v4M9 14h.01M15 14h.01M3 13v2M21 13v2',
  brief: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18',
  repo: 'M6 3h12v18l-6-4-6 4zM9 8h6',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 9.5c0-1 1.3-1.8 3-1.8s3 .8 3 1.8-1.3 1.6-3 1.9-3 .9-3 1.9 1.3 1.8 3 1.8 3-.8 3-1.8M12 6v1.7M12 16.3V18',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6zM9 12l2 2 4-4',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  arrow: 'M7 17 17 7M9 7h8v8',
  trend: 'm3 17 6-6 4 4 8-8M15 7h6v6',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z',
  fold: 'M4 4h16v16H4zM9 4v16M15 10l-2 2 2 2',
  unfold: 'M4 4h16v16H4zM9 4v16M13 10l2 2-2 2',
  chev: 'm6 9 6 6 6-6',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  github: 'M9 19c-4 1.4-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6.2 0C6.6 2.8 5.6 3.1 5.6 3.1a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.2 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  grad: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6',
} as const;

export type IconName = keyof typeof I;

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg className={`ic ${className}`.trim()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={I[name]} />
    </svg>
  );
}

/** Rendered once at the root: the logo gradient and symbol every <Logo> uses. */
export function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="agG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--logo-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--logo-2)' }} />
        </linearGradient>
        <symbol id="agA" viewBox="0 0 898 820">
          <path fill="url(#agG)" fillRule="evenodd" d={LOGO_PATH} />
        </symbol>
      </defs>
    </svg>
  );
}

export function Logo({ className = 'mark' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 898 820" aria-hidden="true"><use href="#agA" /></svg>;
}

export function Tile({ size = '' }: { size?: '' | 'sm' | 'lg' }) {
  return <span className={`tile ${size}`.trim()}><Logo /></span>;
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
