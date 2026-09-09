import '@baseline/theme/theme.css';
import './styles.css';

import { useState } from 'react';

import { RemotePanel } from './remote-panel.tsx';
import { REMOTE_NAMES, type RemoteName } from './runtime-config.ts';

export function App() {
  const [active, setActive] = useState<RemoteName>('people');

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
                    setActive(remote);
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
        <RemotePanel remote={active} />
      </main>
    </>
  );
}
