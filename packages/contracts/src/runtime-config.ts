/**
 * Runtime configuration, shared by all three apps.
 *
 * Remote URLs must resolve from the container's configuration and never from a
 * bundle, so one built artifact runs in every environment. Each app serves a
 * `public/config.js` that sets the global before its bundle runs; in Docker that
 * file is generated from environment variables when the container starts.
 *
 * Which file actually runs falls out of how the page was loaded. Hosted inside
 * the shell, the shell's config.js has already set the global and the remotes
 * simply read it. Standalone, a remote's own config.js sets it. There is no
 * conflict, because a page only ever loads its own.
 *
 * This lives in a package rather than in the shell because remotes need it too:
 * they have to find each other, not only be found.
 */

export interface RuntimeConfig {
  readonly peopleUrl: string;
  readonly deliveryUrl: string;
}

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

/** A URL that resolves to nothing, used to break a remote on purpose. */
const UNREACHABLE_ORIGIN = 'http://127.0.0.1:1';

/**
 * Reads the injected configuration and fails loudly when it is missing.
 *
 * A missing config is a deployment error rather than a runtime condition to
 * recover from: without it nothing knows where anything lives.
 *
 * `source` is a parameter only so this can be tested without a document.
 */
export function readRuntimeConfig(
  source: unknown = typeof window === 'undefined' ? undefined : window.__BASELINE_CONFIG__,
): RuntimeConfig {
  if (typeof source !== 'object' || source === null) {
    throw new Error(
      'window.__BASELINE_CONFIG__ is missing. Is public/config.js served before the bundle?',
    );
  }

  const raw = source as Partial<Record<keyof RuntimeConfig, unknown>>;

  return {
    peopleUrl: requireOrigin(raw.peopleUrl, 'peopleUrl'),
    deliveryUrl: requireOrigin(raw.deliveryUrl, 'deliveryUrl'),
  };
}

/**
 * Which remotes the current URL asks us to break, via `?break=people,delivery`.
 *
 * The deliberate failure trigger the exercise asks for. It points a remote at an
 * unreachable origin rather than faking an error state, so the failure travels
 * the real code path: the manifest fetch rejects.
 */
export function brokenRemotes(
  search: string = typeof window === 'undefined' ? '' : window.location.search,
): ReadonlySet<RemoteName> {
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
