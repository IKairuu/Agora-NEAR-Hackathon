import { Navigate } from 'react-router';
import { AuthLayout } from '../components/AppShell';
import { GoogleButton } from '../components/GoogleButton';
import { nextPathFor, useSession } from '../lib/auth';

/** Get started: one button creates the account. Already signed in? Skip ahead. */
export function Start() {
  const session = useSession();
  if (session) return <Navigate to={nextPathFor(session)} replace />;

  return (
    <AuthLayout>
      <section className="auth-card" aria-labelledby="start-h">
        <div className="stack" style={{ gap: 'var(--space-xs)' }}>
          <h1 id="start-h">Create your account</h1>
          <p className="sub">Signing in with Google creates a NEAR account for you. No seed phrase, no gas.</p>
        </div>
        <GoogleButton className="btn primary lg block" />
        <dl className="kv">
          <dt>Your account</dt><dd>A NEAR account named after you</dd>
          <dt>Agent team</dt><dd>A sub-account that holds agent keys</dd>
          <dt>Gas</dt><dd>Paid by the AGORA relayer</dd>
          <dt>Test USDC</dt><dd className="num">120.00 from the faucet</dd>
        </dl>
        <p className="fine">Already have an account? The same button signs you in. Prototype on NEAR testnet: Google sign-in is simulated with a sample account.</p>
      </section>
    </AuthLayout>
  );
}
