import { Link } from 'react-router';
import { LINKS } from '../config';
import { nextPathFor, useSession } from '../lib/auth';
import { NAV_LINKS } from '../content/landing';
import { Brand, Icon } from './icons';

export function Nav() {
  const session = useSession();
  return (
    <nav className="lnav" aria-label="Site">
      <div className="container">
        <div className="bar3">
          <Brand />
          <div className="links">
            {NAV_LINKS.map((l) => <a key={l.id} href={`#${l.id}`}>{l.label}</a>)}
          </div>
          <div className="acts2">
            <a className="btn glassy demo" href={LINKS.demo}><Icon name="play" />Demo</a>
            {session
              ? <Link className="btn primary" to={nextPathFor(session)}>Open AGORA</Link>
              : <Link className="btn primary" to={LINKS.getStarted}>Get started</Link>}
          </div>
        </div>
      </div>
    </nav>
  );
}
