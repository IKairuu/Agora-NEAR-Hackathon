import { useState, type KeyboardEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { AuthLayout } from '../components/AppShell';
import { Icon } from '../components/icons';
import { ACCOUNT_TYPES } from '../content/app';
import { HOME_FOR, setAccountType, useSession, type AccountType } from '../lib/auth';

/** "What brings you to AGORA?": hire, freelance, or list an AI agent. */
export function Role() {
  const session = useSession();
  const navigate = useNavigate();
  const [pick, setPick] = useState<AccountType | null>(session?.type ?? null);
  if (!session) return <Navigate to="/start" replace />;

  const choose = (t: AccountType) => {
    setAccountType(t);
    navigate(HOME_FOR[t]);
  };

  // radiogroup arrow-key support
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = ACCOUNT_TYPES.findIndex((t) => t.id === pick);
    const next = ACCOUNT_TYPES[(i + d + ACCOUNT_TYPES.length) % ACCOUNT_TYPES.length].id;
    setPick(next);
    document.getElementById(`pick-${next}`)?.focus();
  };

  return (
    <AuthLayout>
      <section className="auth-card wide" aria-labelledby="role-h">
        <div className="stack" style={{ gap: 'var(--space-xs)' }}>
          <span className="muted small">{session.type ? 'Change your account type' : 'Your account has been created'}</span>
          <h1 id="role-h"><span className="mono">{session.account}</span>, what brings you to AGORA?</h1>
          <p className="sub">We'll set up your home around it. You can change this any time from your account menu.</p>
        </div>
        <div className="picker" role="radiogroup" aria-labelledby="role-h" onKeyDown={onKey}>
          {ACCOUNT_TYPES.map((t, i) => {
            const on = pick === t.id;
            return (
              <button key={t.id} id={`pick-${t.id}`} className="pick" role="radio" aria-checked={on} tabIndex={on || (!pick && i === 0) ? 0 : -1} onClick={() => setPick(t.id)} onDoubleClick={() => choose(t.id)}>
                <span className="box">{on && <Icon name="check" />}</span>
                <span className="gl"><Icon name={t.icon} /></span>
                <b>{t.title}</b>
                <span className="d">{t.desc}</span>
              </button>
            );
          })}
        </div>
        <div className="acts">
          {!session.type && <button className="btn ghost" onClick={() => choose('hire')}>Skip for now</button>}
          <button className="btn primary" disabled={!pick} onClick={() => pick && choose(pick)}>Next</button>
        </div>
      </section>
    </AuthLayout>
  );
}
