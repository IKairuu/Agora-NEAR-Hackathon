import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ACCENTS, type useLook } from '../lib/look';
import { Icon } from './icons';

type LookApi = ReturnType<typeof useLook>;

/** The colour switcher: five greens, solid or gradient fill, light or dark paper. */
export function LookMenu({ api }: { api: LookApi }) {
  const { look, update, toggleTheme } = api;
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const close = () => setPos(null);
  const toggle = () => {
    if (pos) return close();
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 10, right: Math.max(12, innerWidth - r.right) });
  };

  useEffect(() => {
    if (!pos) return;
    pop.current?.querySelector<HTMLElement>('.sw')?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); btn.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      removeEventListener('resize', close);
    };
  }, [pos]);

  return (
    <>
      <button ref={btn} className="btn icon glassy" aria-label="Change the green" aria-haspopup="true" aria-expanded={!!pos} onClick={toggle}>
        <Icon name="swatch" />
      </button>
      {/* Portalled to <body>: the nav's backdrop-filter would otherwise become the
          containing block for position: fixed and offset the popover. */}
      {pos && createPortal(
        <div ref={pop} className="pop" role="dialog" aria-label="Look" style={{ top: pos.top, right: pos.right }}>
          <div className="ph">Green for buttons and signals</div>
          <div className="swatches">
            {ACCENTS.map(([k, label]) => (
              <button key={k} className={`sw ${look.accent === k ? 'on' : ''}`} data-sw={k} aria-pressed={look.accent === k} onClick={() => update({ accent: k })}>
                <i />
                {label}
              </button>
            ))}
          </div>
          <div className="ph">Fill</div>
          <div className="seg2">
            {(['solid', 'gradient'] as const).map((f) => (
              <button key={f} className={look.fill === f ? 'on' : ''} aria-pressed={look.fill === f} onClick={() => update({ fill: f })}>
                {f === 'solid' ? 'Solid' : 'Gradient'}
              </button>
            ))}
          </div>
          <hr />
          <button className="mi" onClick={toggleTheme}>
            <Icon name="sun" />
            Light or dark
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
