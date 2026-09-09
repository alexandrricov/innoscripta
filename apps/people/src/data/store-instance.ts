/**
 * The one store the app talks to.
 *
 * Built lazily on first use and cached, so the fixture is fetched once whether
 * People is running standalone or hosted by the shell. Swapping the
 * implementation for IndexedDB is a change to this file and nowhere else.
 */

import { createInMemoryPeopleStore } from './in-memory-people-store.ts';
import type { PeopleStore } from './people-store.ts';
import { fetchPeopleSlice } from './seed-slice.ts';

let pending: Promise<PeopleStore> | undefined;

export function peopleStore(): Promise<PeopleStore> {
  // A failed attempt is not cached, so a reload after a network blip retries
  // instead of serving the same error for the life of the page.
  pending ??= fetchPeopleSlice()
    .then(createInMemoryPeopleStore)
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });

  return pending;
}
