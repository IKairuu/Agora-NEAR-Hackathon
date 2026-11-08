import { useState } from 'react';
import { useNavigate } from 'react-router';
import { nextPathFor, signInWithGoogle } from '../lib/auth';
import { GoogleIcon } from './icons';

/** "Continue with Google": signs in (or creates the account), then routes to role pick or home. */
export function GoogleButton({ className = 'btn primary lg', label = 'Continue with Google' }: { className?: string; label?: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const s = await signInWithGoogle();
      navigate(nextPathFor(s));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={className} onClick={go} aria-busy={busy} disabled={busy}>
      {busy ? <span className="spin" aria-hidden="true" /> : <GoogleIcon />}
      {busy ? 'Connecting to Google…' : label}
    </button>
  );
}
