/**
 * Hosts one remote in an isolated panel.
 *
 * A remote is fetched over the network, so it can be missing, stale or broken.
 * When that happens the shell must stay alive and say so in place of that
 * panel - never blank the page. Both failure paths are covered here: a rejected
 * manifest fetch (caught by the boundary through Suspense) and a runtime error
 * thrown while the remote renders.
 */

import type { RemoteName } from '@baseline/contracts';
import { Component, type ErrorInfo, lazy, type ReactNode, Suspense } from 'react';

import { loadRemoteApp } from './remotes.ts';

interface RemotePanelProps {
  readonly remote: RemoteName;
}

const REMOTE_APPS: Record<RemoteName, ReturnType<typeof lazy>> = {
  people: lazy(async () => ({ default: await loadRemoteApp('people') })),
  delivery: lazy(async () => ({ default: await loadRemoteApp('delivery') })),
};

export function RemotePanel({ remote }: RemotePanelProps) {
  const RemoteApp = REMOTE_APPS[remote];

  return (
    // Keyed by remote so switching panels remounts the boundary. Without the
    // key one failed remote keeps the boundary in its error state and poisons
    // the panel of every other remote - the opposite of isolation.
    <RemoteErrorBoundary key={remote} remote={remote}>
      <Suspense fallback={<p aria-busy="true">Loading {remote}...</p>}>
        <RemoteApp />
      </Suspense>
    </RemoteErrorBoundary>
  );
}

interface RemoteErrorBoundaryProps {
  readonly remote: RemoteName;
  readonly children: ReactNode;
}

interface RemoteErrorBoundaryState {
  readonly error: Error | null;
}

class RemoteErrorBoundary extends Component<RemoteErrorBoundaryProps, RemoteErrorBoundaryState> {
  override state: RemoteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): RemoteErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`Remote "${this.props.remote}" failed`, error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <section role="alert">
        <h2>{this.props.remote} is unavailable</h2>
        <p>The rest of the suite keeps working. Reload once the remote is back.</p>
        <p>{error.message}</p>
      </section>
    );
  }
}
