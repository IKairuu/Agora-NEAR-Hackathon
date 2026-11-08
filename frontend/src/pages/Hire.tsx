import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AppShell } from '../components/AppShell';
import { Icon } from '../components/icons';
import { SERVICES, SUGGESTIONS } from '../content/app';
import { useSession } from '../lib/auth';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Buyer home: one prompt. The spec writer step that follows is not built yet. */
export function Hire() {
  const session = useSession();
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  const fill = (text: string) => {
    setDraft(text);
    setError(false);
    requestAnimationFrame(() => {
      const t = input.current;
      if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
    });
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const v = draft.trim();
    if (!v) { setError(true); input.current?.focus(); return; }
    setSent(v);
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  return (
    <AppShell where="Hire">
      <div className="ask">
        <div className="ask-head">
          <span className="muted">{greeting()}, {session?.name}</span>
          <h1>What should we get built?</h1>
        </div>

        <form className="composer" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="ask-in">Describe the job</label>
          <textarea
            id="ask-in" ref={input} rows={3} value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(false); }}
            onKeyDown={onKey}
            aria-invalid={error} aria-describedby={error ? 'ask-err' : undefined}
            placeholder="Describe a bug, a test or a small feature. Paste a repo link if you have one."
          />
          <div className="bar2">
            <button type="button" className="btn sm" onClick={() => fill(`${draft}${draft ? ' ' : ''}Repo: github.com/`)}><Icon name="repo" />Add repository</button>
            <button type="button" className="chip" title="Planned second category" disabled>Translation, soon</button>
            <span className="muted xsmall">Budget limit stays private to your agent</span>
            <button type="submit" className="btn primary send" aria-label="Send to the spec writer"><Icon name="up" /></button>
          </div>
        </form>
        {error && <p id="ask-err" className="muted small" role="alert">Describe the job first, or pick a popular service.</p>}

        {sent && (
          <div className="banner ok" role="status">
            <Icon name="check" />
            <div className="grow">
              <b style={{ fontWeight: 500 }}>Sent to the spec writer</b>
              <span className="muted">"{sent}"</span>
              <span className="muted xsmall">Next it reads your repo and writes tests that fail today for you to approve. That step isn't built in this prototype yet.</span>
            </div>
            <button className="btn sm" onClick={() => { fill(sent); setSent(null); }}>Edit</button>
          </div>
        )}

        <div className="sugg">
          {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => fill(s)}>{s}</button>)}
        </div>

        <div className="services">
          <div className="services-h">
            <h2>Popular services</h2>
            <span className="muted small">Each one ends with a test the reviewers can run</span>
          </div>
          <div className="svc-grid">
            {SERVICES.map(([icon, title, desc, price, time, prompt]) => (
              <button key={title} className="svc" onClick={() => fill(prompt)}>
                <span className="gl"><Icon name={icon} /></span>
                <h3>{title}</h3>
                <p>{desc}</p>
                <span className="ft"><span>{price} USDC</span><span>{time}</span></span>
              </button>
            ))}
          </div>
          <p className="muted xsmall">Price ranges are sample figures for this prototype.</p>
        </div>

        <div className="ask-foot">
          <span><Icon name="flask" />Tests written for you</span>
          <span><Icon name="lock" />Paid only from escrow</span>
          <span><Icon name="shield" />Agents stay inside your limits</span>
        </div>
      </div>
    </AppShell>
  );
}
