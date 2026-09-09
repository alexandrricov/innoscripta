/**
 * Fetching the other remote's contract at runtime.
 *
 * No URL appears here or in any bundle. The addresses come from the injected
 * configuration, are handed to the federation runtime with `registerRemotes`,
 * and only then does anything reach the network - on the first `loadRemote`.
 *
 * Every failure is a rejected promise rather than a throw somewhere unexpected,
 * because the caller is expected to carry on without the contract. A remote
 * that cannot reach its neighbour is degraded, not broken.
 */

import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime';

import { CONTRACT_VERSION, type DeliveryContract, type PeopleContract } from './contracts.ts';
import {
  brokenRemotes,
  readRuntimeConfig,
  remoteEntryUrl,
  type RemoteName,
} from './runtime-config.ts';

/** Registered once per federation instance; a second call would be wasted. */
const registered = new Set<RemoteName>();

function register(remote: RemoteName): void {
  if (registered.has(remote)) {
    return;
  }

  registerRemotes([
    { name: remote, entry: remoteEntryUrl(remote, readRuntimeConfig(), brokenRemotes()) },
  ]);
  registered.add(remote);
}

export function loadPeopleContract(): Promise<PeopleContract> {
  return loadContract<PeopleContract>('people', ['employees', 'pricing', 'subscribe']);
}

export function loadDeliveryContract(): Promise<DeliveryContract> {
  return loadContract<DeliveryContract>('delivery', ['allocatedHours', 'subscribe']);
}

async function loadContract<T extends { readonly version: number }>(
  remote: RemoteName,
  methods: readonly string[],
): Promise<T> {
  register(remote);

  const loaded = await loadRemote<{ contract?: unknown }>(`${remote}/contract`);
  const contract = loaded?.contract;

  if (typeof contract !== 'object' || contract === null) {
    throw new Error(`Remote "${remote}" did not expose a contract`);
  }

  const candidate = contract as Record<string, unknown>;

  if (candidate.version !== CONTRACT_VERSION) {
    throw new Error(
      `Remote "${remote}" publishes contract version ${String(candidate.version)}, this build speaks ${String(CONTRACT_VERSION)}`,
    );
  }

  for (const method of methods) {
    if (typeof candidate[method] !== 'function') {
      throw new Error(`Remote "${remote}" contract is missing ${method}()`);
    }
  }

  return contract as T;
}
