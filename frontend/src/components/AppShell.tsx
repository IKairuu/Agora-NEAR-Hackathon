import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useLocation } from 'react-router';
import { ACCOUNT_TYPES } from '../content/app';
import { HOME_FOR, signedOutPath, signOut, useSession, type Session } from '../lib/auth';
import { Brand, Icon } from './icons';

function AccountMenu({ session }: { session: Session }) {
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
    pop.current?.querySelector<HTMLElement>('.mi')?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); btn.current?.focus(); } };
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
      <button ref={btn} className="me-btn" aria-label="Account menu" aria-haspopup="menu" aria-expanded={!!pos} onClick={toggle}>
        <span className="avatar">{session.initials}</span>
      </button>
      {pos && createPortal(
        <div ref={pop} className="pop" role="menu" style={{ top: pos.top, right: pos.right }}>
          <div className="who"><b>{session.name}</b><span className="muted small mono">{session.account}</span></div>
          <hr />
          {ACCOUNT_TYPES.map((t) => (
            <Link key={t.id} className="mi" role="menuitem" to={HOME_FOR[t.id]} onClick={close}>
              <Icon name={t.icon} />{t.menu}{session.type === t.id && <span className="aside">Yours</span>}
            </Link>
          ))}
          <hr />
          <Link className="mi" role="menuitem" to="/start/role" onClick={close}><Icon name="swap" />Change what brings you here</Link>
          <button className="mi" role="menuitem" onClick={() => { close(); signOut(); }}><Icon name="out" />Sign out</button>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Top bar and page frame for signed-in screens. Sends signed-out visitors to sign-up. */
export function AppShell({ where, children }: { where: string; children: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (!session) return <Navigate to={signedOutPath()} replace state={{ from: location.pathname }} />;
  if (!session.type) return <Navigate to="/start/role" replace />;

  return (
    <div className="app">
      <header className="top night">
        <Brand to="/" />
        <span className="where">{where}</span>
        <div className="top-right">
          <span className="net" title="All money here is testnet USDC">Testnet</span>
          <AccountMenu session={session} />
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

/** Frame for the sign-up screens: night field, wordmark, way back home. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth night">
      <div className="dots" aria-hidden="true" />
      <div className="auth-top">
        <Brand to="/" />
        <Link className="back" to="/">Back to home</Link>
      </div>
      <main className="auth-main">{children}</main>
    </div>
  );
}
