/**
 * Remote registration.
 *
 * The federation plugin declares this build's name and its shared dependencies,
 * but no remote URLs. They are handed to the runtime here, once, from the
 * injected configuration.
 */

import {
  brokenRemotes,
  type HostSession,
  readRuntimeConfig,
  REMOTE_NAMES,
  remoteEntryUrl,
  type RemoteName,
} from '@baseline/contracts';
import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime';
import type { ComponentType } from 'react';

/**
 * What every remote is expected to expose under `./App`.
 *
 * The props are optional on the remote's side - it runs standalone with nothing
 * pushed in - which is why this is `Partial`-shaped rather than required here
 * too. The host always passes them.
 */
export type RemoteApp = ComponentType<{ readonly session?: HostSession }>;

export interface RemoteAppModule {
  readonly App: RemoteApp;
}

export function registerConfiguredRemotes(): void {
  const config = readRuntimeConfig();
  const broken = brokenRemotes();

  registerRemotes(
    REMOTE_NAMES.map((name) => ({
      name,
      entry: remoteEntryUrl(name, config, broken),
    })),
  );
}

/**
 * Loads a remote's exposed App component.
 *
 * Rejects when the remote is unreachable or does not expose what we expect;
 * the caller renders that as a dead panel rather than letting it take the shell
 * down.
 */
export async function loadRemoteApp(remote: RemoteName): Promise<RemoteApp> {
  const loaded = await loadRemote<RemoteAppModule>(`${remote}/App`);

  if (!loaded || typeof loaded.App !== 'function') {
    throw new Error(`Remote "${remote}" did not expose an App component`);
  }

  return loaded.App;
}
