/**
 * The register held in memory.
 *
 * Used by tests, and by the app until IndexedDB is wired in behind the same
 * interface. Edits do not survive a reload here, which is exactly why this is
 * not the final implementation.
 */

import { compareCalendarDay } from '@baseline/domain';

import type { Employee, PeopleStore, StoredRate } from './people-store.ts';
import type { PeopleSlice } from './seed-slice.ts';

export function createInMemoryPeopleStore(slice: PeopleSlice): PeopleStore {
  const employees = new Map(slice.employees.map((employee) => [employee.id, employee]));
  const rates = new Map(slice.rates.map((rate) => [rate.id, rate]));

  return {
    listEmployees: () => Promise.resolve([...employees.values()]),

    getEmployee: (employeeId) => Promise.resolve(employees.get(employeeId)),

    listRates: (employeeId) =>
      Promise.resolve(
        [...rates.values()]
          .filter((rate) => rate.employeeId === employeeId)
          .sort((a, b) => compareCalendarDay(a.validFrom, b.validFrom)),
      ),

    saveRate: (rate) => {
      if (!employees.has(rate.employeeId)) {
        return Promise.reject(
          new Error(`Cannot save a rate for unknown employee "${rate.employeeId}"`),
        );
      }
      rates.set(rate.id, rate);
      return Promise.resolve();
    },

    removeRate: (rateId) => {
      rates.delete(rateId);
      return Promise.resolve();
    },
  };
}

/** Handy in tests that only care about employees. */
export function createInMemoryPeopleStoreFrom(
  employees: readonly Employee[],
  rates: readonly StoredRate[] = [],
): PeopleStore {
  return createInMemoryPeopleStore({ employees, rates });
}
