/**
 * Delivery's own database.
 *
 * Separate from People's, so neither app can read the other's object stores
 * even by mistake. The browser holds the ownership boundary.
 */

import type { Allocation, BreakdownItem } from '@baseline/domain';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import type { Project } from './delivery-store.ts';
import type { DeliverySlice } from './seed-slice.ts';

const DATABASE_NAME = 'baseline-delivery';
const DATABASE_VERSION = 1;

export interface DeliverySchema extends DBSchema {
  projects: {
    key: string;
    value: Project;
  };
  breakdownItems: {
    key: string;
    value: BreakdownItem;
    /**
     * By project, not by parent, and that is not an oversight: IndexedDB skips
     * records whose indexed value is null, and every root item has a null
     * parentId. An index by parent would silently omit exactly the rows the
     * tree starts from. Ninety items per project assemble into a tree in memory
     * in no time.
     */
    indexes: { 'by-project': string };
  };
  allocations: {
    key: string;
    value: Allocation;
    indexes: {
      'by-item': string;
      /** Cross-project capacity reads an employee's whole month, R5. */
      'by-employee': string;
    };
  };
}

export type DeliveryDatabase = IDBPDatabase<DeliverySchema>;

/** `name` is a parameter only so tests can use a fresh database each time. */
export function openDeliveryDatabase(name: string = DATABASE_NAME): Promise<DeliveryDatabase> {
  return openDB<DeliverySchema>(name, DATABASE_VERSION, {
    upgrade(db) {
      db.createObjectStore('projects', { keyPath: 'id' });

      const items = db.createObjectStore('breakdownItems', { keyPath: 'id' });
      items.createIndex('by-project', 'projectId');

      const allocations = db.createObjectStore('allocations', { keyPath: 'id' });
      allocations.createIndex('by-item', 'breakdownItemId');
      allocations.createIndex('by-employee', 'employeeId');
    },
  });
}

/**
 * Fills an empty database from the seed fixture, once.
 *
 * Same shape as People's: check, fetch, then write with the check repeated
 * inside the writing transaction. The network call cannot sit inside a
 * transaction, because a transaction commits as soon as the microtask queue
 * drains. The repeat covers two tabs both finding an empty database.
 *
 * All three object stores are written in one transaction, so a plan with a tree
 * but no allocations is not a state this can leave behind.
 */
export async function seedIfEmpty(
  db: DeliveryDatabase,
  loadSlice: () => Promise<DeliverySlice>,
): Promise<void> {
  if ((await db.count('projects')) > 0) {
    return;
  }

  const slice = await loadSlice();

  const tx = db.transaction(['projects', 'breakdownItems', 'allocations'], 'readwrite');
  const projects = tx.objectStore('projects');

  if ((await projects.count()) === 0) {
    const items = tx.objectStore('breakdownItems');
    const allocations = tx.objectStore('allocations');

    await Promise.all([
      ...slice.projects.map((project) => projects.put(project)),
      ...slice.items.map((item) => items.put(item)),
      ...slice.allocations.map((allocation) => allocations.put(allocation)),
    ]);
  }

  await tx.done;
}
