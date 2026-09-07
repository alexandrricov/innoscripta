import { useState } from 'react';

import { RemotePanel } from './remote-panel.tsx';
import { REMOTE_NAMES, type RemoteName } from './runtime-config.ts';

export function App() {
  const [active, setActive] = useState<RemoteName>('people');

  return (
    <>
      <header>
        <h1>Baseline</h1>
        <nav aria-label="Applications">
          <ul>
            {REMOTE_NAMES.map((remote) => (
              <li key={remote}>
                <button
                  type="button"
                  onClick={() => setActive(remote)}
                  aria-current={remote === active ? 'page' : undefined}
                >
                  {remote}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main>
        <RemotePanel remote={active} />
      </main>
    </>
  );
}
