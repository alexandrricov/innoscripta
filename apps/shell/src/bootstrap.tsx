import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import { registerConfiguredRemotes } from './remotes.ts';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root is missing from index.html');
}

// Remotes must be known to the federation runtime before anything tries to load
// one, so this runs before the first render.
registerConfiguredRemotes();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
