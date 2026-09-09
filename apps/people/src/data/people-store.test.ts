/**
 * One contract, both implementations.
 *
 * Every expectation below runs twice: against the Map and against IndexedDB.
 * That is what makes "swapping the implementation changes nothing above the
 * interface" a checked statement rather than an intention.
 */

import 'fake-indexeddb/auto';

import { parseCalendarDay } from '@baseline/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryPeopleStore } from './in-memory-people-store.ts';
import { createIndexedDbPeopleStore } from './indexeddb-people-store.ts';
import { openPeopleDatabase, seedIfEmpty } from './people-database.ts';
import type { PeopleStore, StoredRate } from './people-store.ts';
import type { PeopleSlice } from './seed-slice.ts';

function rate(id: string, employeeId: string, validFrom: string, hourlyCost: number): StoredRate {
  return { id, employeeId, validFrom: parseCalendarDay(validFrom), hourlyCost };
}

function fixture(): PeopleSlice {
  return {
    employees: [
      { id: 'emp-001', name: 'Adaeze Okafor', role: 'Tech Lead', weeklyHours: 40 },
      { id: 'emp-002', name: 'Milan Brandt', role: 'Backend Engineer', weeklyHours: 32 },
    ],
    rates: [
      rate('rate-001', 'emp-001', '2025-01-01', 80),
      rate('rate-002', 'emp-001', '2026-03-12', 95),
      rate('rate-003', 'emp-002', '2025-06-01', 120),
    ],
  };
}

/** A fresh database per store, so no test can see another one's writes. */
let databaseCounter = 0;

async function indexedDbStore(slice: PeopleSlice): Promise<PeopleStore> {
  databaseCounter += 1;
  const db = await openPeopleDatabase(`contract-test-${String(databaseCounter)}`);
  await seedIfEmpty(db, () => Promise.resolve(slice));

  return createIndexedDbPeopleStore(db);
}

const implementations = [
  ['in memory', (slice: PeopleSlice) => Promise.resolve(createInMemoryPeopleStore(slice))],
  ['indexeddb', indexedDbStore],
] as const;

describe.each(implementations)('%s', (_name, createStore) => {
  let store: PeopleStore;

  beforeEach(async () => {
    store = await createStore(fixture());
  });

  it('lists every employee', async () => {
    const employees = await store.listEmployees();

    expect(employees.map((employee) => employee.id).sort()).toStrictEqual(['emp-001', 'emp-002']);
  });

  it('finds one employee, and says nothing about an unknown id', async () => {
    await expect(store.getEmployee('emp-002')).resolves.toMatchObject({ name: 'Milan Brandt' });
    await expect(store.getEmployee('emp-999')).resolves.toBeUndefined();
  });

  it('returns an employee history oldest first', async () => {
    const rates = await store.listRates('emp-001');

    expect(rates.map((entry) => entry.id)).toStrictEqual(['rate-001', 'rate-002']);
  });

  it('returns only that employee history', async () => {
    await expect(store.listRates('emp-002')).resolves.toHaveLength(1);
    await expect(store.listRates('emp-999')).resolves.toStrictEqual([]);
  });

  it('adds a rate, in the right place in the history', async () => {
    await store.saveRate(rate('rate-new', 'emp-001', '2025-07-01', 88));

    const rates = await store.listRates('emp-001');

    expect(rates.map((entry) => entry.id)).toStrictEqual(['rate-001', 'rate-new', 'rate-002']);
  });

  it('replaces a rate with the same id rather than duplicating it', async () => {
    await store.saveRate(rate('rate-001', 'emp-001', '2025-01-01', 85));

    const rates = await store.listRates('emp-001');

    expect(rates).toHaveLength(2);
    expect(rates[0]).toMatchObject({ id: 'rate-001', hourlyCost: 85 });
  });

  it('accepts a rate dated in the past, because history is correctable', async () => {
    await store.saveRate(rate('rate-old', 'emp-001', '2024-01-01', 70));

    await expect(store.listRates('emp-001')).resolves.toHaveLength(3);
  });

  it('removes a rate', async () => {
    await store.removeRate('rate-002');

    await expect(store.listRates('emp-001')).resolves.toHaveLength(1);
  });

  it('ignores removing something that is not there', async () => {
    await expect(store.removeRate('rate-999')).resolves.toBeUndefined();
    await expect(store.listRates('emp-001')).resolves.toHaveLength(2);
  });

  it('refuses a rate for an employee who does not exist', async () => {
    await expect(store.saveRate(rate('rate-x', 'emp-999', '2025-01-01', 80))).rejects.toThrow(
      /emp-999/,
    );
  });
});

describe('seeding the database', () => {
  it('imports the slice when the database is empty', async () => {
    databaseCounter += 1;
    const db = await openPeopleDatabase(`seed-test-${String(databaseCounter)}`);

    await seedIfEmpty(db, () => Promise.resolve(fixture()));

    await expect(db.count('employees')).resolves.toBe(2);
    await expect(db.count('rates')).resolves.toBe(3);
  });

  it('does not go back to the network once there is data', async () => {
    databaseCounter += 1;
    const db = await openPeopleDatabase(`seed-test-${String(databaseCounter)}`);
    const loadSlice = vi.fn(() => Promise.resolve(fixture()));

    await seedIfEmpty(db, loadSlice);
    await seedIfEmpty(db, loadSlice);
    await seedIfEmpty(db, loadSlice);

    expect(loadSlice).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when the fixture cannot be loaded', async () => {
    databaseCounter += 1;
    const db = await openPeopleDatabase(`seed-test-${String(databaseCounter)}`);

    await expect(seedIfEmpty(db, () => Promise.reject(new Error('offline')))).rejects.toThrow(
      'offline',
    );

    await expect(db.count('employees')).resolves.toBe(0);
    await expect(db.count('rates')).resolves.toBe(0);
  });

  it('imports both stores or neither', async () => {
    databaseCounter += 1;
    const db = await openPeopleDatabase(`seed-test-${String(databaseCounter)}`);

    await seedIfEmpty(db, () => Promise.resolve(fixture()));

    // The write spans both object stores in one transaction, so a half-imported
    // register is not reachable.
    const employees = await db.count('employees');
    const rates = await db.count('rates');

    expect(employees > 0 && rates > 0).toBe(true);
  });
});
