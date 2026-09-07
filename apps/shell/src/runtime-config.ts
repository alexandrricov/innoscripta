/**
 * Runtime configuration.
 *
 * Remote URLs must resolve from the container's configuration, never from this
 * bundle, so that one built artifact runs in every environment. `public/config.js`
 * sets the global before the bundle executes; in Docker that file is generated
 * from environment variables when the container starts.
 */

export interface RuntimeConfig {
  readonly peopleUrl: string;
  readonly deliveryUrl: string;
}

/** The remotes the shell knows how to host. */
export const REMOTE_NAMES = ['people', 'delivery'] as const;

export type RemoteName = (typeof REMOTE_NAMES)[number];

declare global {
  interface Window {
    __BASELINE_CONFIG__?: Partial<Record<keyof RuntimeConfig, unknown>>;
  }
}

const CONFIG_KEY_BY_REMOTE = {
  people: 'peopleUrl',
  delivery: 'deliveryUrl',
} as const satisfies Record<RemoteName, keyof RuntimeConfig>;

/**
 * A URL that resolves to nothing, used to break a remote on purpose.
 * See `brokenRemotes()` below.
 */
const UNREACHABLE_ORIGIN = 'http://127.0.0.1:1';

/**
 * Reads the injected configuration and fails loudly if it is missing.
 *
 * A missing config is a deployment error, not a runtime condition to recover
 * from: without it the shell has no idea where its remotes live.
 */
export function readRuntimeConfig(): RuntimeConfig {
  const raw = window.__BASELINE_CONFIG__;
  if (!raw) {
    throw new Error(
      'window.__BASELINE_CONFIG__ is missing. Is public/config.js served before the bundle?',
    );
  }

  return {
    peopleUrl: requireOrigin(raw.peopleUrl, 'peopleUrl'),
    deliveryUrl: requireOrigin(raw.deliveryUrl, 'deliveryUrl'),
  };
}

/**
 * Which remotes the current URL asks us to break, via `?break=people,delivery`.
 *
 * This is the deliberate failure trigger the exercise asks for. It points a
 * remote at an unreachable origin rather than faking an error state, so the
 * failure travels the real code path: the manifest fetch rejects.
 */
export function brokenRemotes(search: string = window.location.search): ReadonlySet<RemoteName> {
  const requested = new URLSearchParams(search).get('break');
  if (requested === null) {
    return new Set();
  }

  const names = requested
    .split(',')
    .map((name) => name.trim())
    .filter((name): name is RemoteName => (REMOTE_NAMES as readonly string[]).includes(name));

  return new Set(names);
}

/** The manifest URL for one remote, honouring the break switch. */
export function remoteEntryUrl(
  remote: RemoteName,
  config: RuntimeConfig,
  broken: ReadonlySet<RemoteName>,
): string {
  const origin = broken.has(remote) ? UNREACHABLE_ORIGIN : config[CONFIG_KEY_BY_REMOTE[remote]];
  return `${origin.replace(/\/$/, '')}/remoteEntry.js`;
}

function requireOrigin(value: unknown, key: keyof RuntimeConfig): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Runtime config key "${key}" must be a non-empty string, got ${String(value)}`);
  }
  return value;
}
