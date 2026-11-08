import { LINKS } from '../config';
import { NAV_LINKS } from '../content/landing';
import type { useLook } from '../lib/look';
import { Brand, Icon } from './icons';
import { LookMenu } from './LookMenu';

export function Nav({ look }: { look: ReturnType<typeof useLook> }) {
  return (
    <nav className="lnav" aria-label="Site">
      <div className="container">
        <div className="bar3">
          <Brand />
          <div className="links">
            {NAV_LINKS.map((l) => <a key={l.id} href={`#${l.id}`}>{l.label}</a>)}
          </div>
          <div className="acts2">
            <LookMenu api={look} />
            <a className="btn glassy demo" href={LINKS.demo}><Icon name="play" />Demo</a>
            <a className="btn primary" href={LINKS.getStarted}>Get started</a>
          </div>
        </div>
      </div>
    </nav>
  );
}
