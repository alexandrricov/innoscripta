/**
 * Telling anybody who cares that the register changed.
 *
 * This is what makes "a rate edited in People reaches any open Delivery cost
 * view with no reload" true. Delivery subscribes through the published
 * contract, and a save here calls it.
 *
 * The store is wrapped rather than each caller remembering to announce its
 * write, so a new write path cannot quietly stop notifying.
 *
 * Listeners are plain callbacks. Both apps run in one page and one JavaScript
 * realm, so nothing needs serialising. Two separate browser tabs would not see
 * each other - `BroadcastChannel` is the answer to that, and it is out of scope
 * here.
 */

import type { PeopleStore } from './people-store.ts';

const listeners = new Set<() => void>();

export function onPeopleChanged(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function announce(): void {
  for (const listener of [...listeners]) {
    // One broken subscriber must not stop the others, or stop the write from
    // being reported as successful.
    try {
      listener();
    } catch (error: unknown) {
      console.error('A subscriber to People failed', error);
    }
  }
}

export function withChangeNotifications(store: PeopleStore): PeopleStore {
  return {
    ...store,

    saveRate: async (rate) => {
      await store.saveRate(rate);
      announce();
    },

    removeRate: async (rateId) => {
      await store.removeRate(rateId);
      announce();
    },
  };
}
