/**
 * The one store the app talks to.
 *
 * The only file that knows which implementation is in use, so moving from a Map
 * to IndexedDB was a change here and nowhere else.
 */

import { openDeliveryDatabase, seedIfEmpty } from './delivery-database.ts';
import type { DeliveryStore } from './delivery-store.ts';
import { createIndexedDbDeliveryStore } from './indexeddb-delivery-store.ts';
import { fetchDeliverySlice } from './seed-slice.ts';
import { withChangeNotifications } from './store-changes.ts';

let pending: Promise<DeliveryStore> | undefined;

export function deliveryStore(): Promise<DeliveryStore> {
  // A failure is not cached, so a reload after a network blip retries instead of
  // serving the same error for the life of the page.
  pending ??= build().catch((error: unknown) => {
    pending = undefined;
    throw error;
  });

  return pending;
}

async function build(): Promise<DeliveryStore> {
  const db = await openDeliveryDatabase();
  await seedIfEmpty(db, fetchDeliverySlice);

  // Wrapped so every write announces itself, which is what the published
  // contract's subscribe() forwards to People.
  return withChangeNotifications(createIndexedDbDeliveryStore(db));
}
