/**
 * Remote registration.
 *
 * The federation plugin declares this build's name and its shared dependencies,
 * but no remote URLs. They are handed to the runtime here, once, from the
 * injected configuration.
 */

import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime';
import type { ComponentType } from 'react';

import {
  brokenRemotes,
  readRuntimeConfig,
  remoteEntryUrl,
  REMOTE_NAMES,
  type RemoteName,
} from './runtime-config.ts';

/** What every remote is expected to expose under `./App`. */
export interface RemoteAppModule {
  readonly App: ComponentType;
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
export async function loadRemoteApp(remote: RemoteName): Promise<ComponentType> {
  const loaded = await loadRemote<RemoteAppModule>(`${remote}/App`);

  if (!loaded || typeof loaded.App !== 'function') {
    throw new Error(`Remote "${remote}" did not expose an App component`);
  }

  return loaded.App;
}
