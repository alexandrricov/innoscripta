import '@baseline/theme/theme.css';
import './styles.css';

import { REMOTE_NAMES, type RemoteName } from '@baseline/contracts';
import { useState } from 'react';

import { RemotePanel } from './remote-panel.tsx';

export function App() {
  const [active, setActive] = useState<RemoteName>('people');
  /**
   * A remote is mounted on its first visit and then stays mounted, hidden
   * rather than unmounted.
   *
   * Both halves of what is required need that. Loading stays lazy, so a remote
   * nobody opened is never fetched - visible in the network panel. But "a rate
   * edited in People reaches any open Delivery cost view with no reload" needs
   * the other view to still be there: unmounting it on every switch tears down
   * its subscription, and a change would have nothing left to reach.
   */
  const [visited, setVisited] = useState<ReadonlySet<RemoteName>>(new Set([active]));

  const open = (remote: RemoteName): void => {
    setActive(remote);
    setVisited((current) => (current.has(remote) ? current : new Set([...current, remote])));
  };

  return (
    <>
      <header className="shell-header">
        <h1 className="shell-title">Baseline</h1>
        <nav aria-label="Applications">
          <ul className="shell-nav-list">
            {REMOTE_NAMES.map((remote) => (
              <li key={remote}>
                <button
                  type="button"
                  className="shell-nav-button"
                  onClick={() => {
                    open(remote);
                  }}
                  aria-current={remote === active ? 'page' : undefined}
                >
                  {remote}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="shell-main">
        {REMOTE_NAMES.filter((remote) => visited.has(remote)).map((remote) => (
          // `hidden` rather than a CSS class: it also takes the panel out of the
          // accessibility tree, so a screen reader is not read two applications
          // at once.
          <div key={remote} hidden={remote !== active}>
            <RemotePanel remote={remote} />
          </div>
        ))}
      </main>
    </>
  );
}
