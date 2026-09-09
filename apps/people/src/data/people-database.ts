/**
 * People's own database.
 *
 * A database per remote, not a shared one. Delivery has its own, and the two
 * cannot see each other's object stores, so ownership is enforced by the browser
 * rather than by everybody remembering the rule.
 *
 * `localStorage` would have been simpler and is the wrong tool: it is
 * synchronous, so every keystroke in an editor would serialise the whole store
 * on the main thread.
 */

import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import type { Employee, StoredRate } from './people-store.ts';
import type { PeopleSlice } from './seed-slice.ts';

const DATABASE_NAME = 'baseline-people';
const DATABASE_VERSION = 1;

export interface PeopleSchema extends DBSchema {
  employees: {
    key: string;
    value: Employee;
  };
  rates: {
    key: string;
    value: StoredRate;
    // Without it, listing one employee's history would read all 150 records and
    // filter them in memory.
    indexes: { 'by-employee': string };
  };
}

export type PeopleDatabase = IDBPDatabase<PeopleSchema>;

/** `name` is a parameter only so tests can use a fresh database each time. */
export function openPeopleDatabase(name: string = DATABASE_NAME): Promise<PeopleDatabase> {
  return openDB<PeopleSchema>(name, DATABASE_VERSION, {
    upgrade(db) {
      db.createObjectStore('employees', { keyPath: 'id' });
      const rates = db.createObjectStore('rates', { keyPath: 'id' });
      rates.createIndex('by-employee', 'employeeId');
    },
  });
}

/**
 * Fills an empty database from the seed fixture, once.
 *
 * An empty `employees` store is the signal for a first run. That is safe here
 * because the register has no way to delete an employee, so the store cannot
 * legitimately become empty again.
 *
 * Note where the network call sits: between two transactions, not inside one.
 * An IndexedDB transaction commits as soon as the microtask queue drains, so
 * awaiting a `fetch` inside one closes it underneath you. Hence check, fetch,
 * then write - and check again inside the writing transaction, because two open
 * tabs can both see an empty database and both fetch. Only the first write
 * lands.
 *
 * The write itself spans both object stores in one transaction, so "employees
 * imported but rates missing" is not a state this can end up in.
 */
export async function seedIfEmpty(
  db: PeopleDatabase,
  loadSlice: () => Promise<PeopleSlice>,
): Promise<void> {
  if ((await db.count('employees')) > 0) {
    return;
  }

  const slice = await loadSlice();

  const tx = db.transaction(['employees', 'rates'], 'readwrite');
  const employees = tx.objectStore('employees');
  const rates = tx.objectStore('rates');

  if ((await employees.count()) === 0) {
    await Promise.all([
      ...slice.employees.map((employee) => employees.put(employee)),
      ...slice.rates.map((rate) => rates.put(rate)),
    ]);
  }

  await tx.done;
}
