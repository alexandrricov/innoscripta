/**
 * The one store the app talks to.
 *
 * Built lazily on first use and cached, so the database is opened once whether
 * People is running standalone or hosted by the shell.
 *
 * This is the only file that knows which implementation is in use. Everything
 * above it sees `PeopleStore`, which is why moving from a Map to IndexedDB
 * changed nothing else.
 */

import { createIndexedDbPeopleStore } from './indexeddb-people-store.ts';
import { openPeopleDatabase, seedIfEmpty } from './people-database.ts';
import type { PeopleStore } from './people-store.ts';
import { fetchPeopleSlice } from './seed-slice.ts';
import { withChangeNotifications } from './store-changes.ts';

let pending: Promise<PeopleStore> | undefined;

export function peopleStore(): Promise<PeopleStore> {
  // A failed attempt is not cached, so a reload after a network blip retries
  // instead of serving the same error for the life of the page.
  pending ??= build().catch((error: unknown) => {
    pending = undefined;
    throw error;
  });

  return pending;
}

async function build(): Promise<PeopleStore> {
  const db = await openPeopleDatabase();
  // Only reaches the network on a first run. After that the fixture is never
  // fetched again, which is observable: the request is absent on a reload.
  await seedIfEmpty(db, fetchPeopleSlice);

  // Wrapped so every write announces itself, which is what the published
  // contract's subscribe() forwards to Delivery.
  return withChangeNotifications(createIndexedDbPeopleStore(db));
}
