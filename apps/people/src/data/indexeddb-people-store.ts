/**
 * The register, backed by IndexedDB.
 *
 * The same interface as the in-memory one, so swapping them is a change to
 * `store-instance.ts` and nowhere else. One contract test runs against both,
 * which is what makes that claim more than a hope.
 */

import { compareCalendarDay } from '@baseline/domain';

import type { PeopleDatabase } from './people-database.ts';
import type { PeopleStore } from './people-store.ts';

export function createIndexedDbPeopleStore(db: PeopleDatabase): PeopleStore {
  return {
    listEmployees: () => db.getAll('employees'),

    getEmployee: (employeeId) => db.get('employees', employeeId),

    listRates: async (employeeId) => {
      const rates = await db.getAllFromIndex('rates', 'by-employee', employeeId);
      // The index groups by employee but says nothing about order, and a rate
      // history is only readable oldest first.
      return rates.sort((a, b) => compareCalendarDay(a.validFrom, b.validFrom));
    },

    saveRate: async (rate) => {
      // A rate belonging to nobody would be invisible in the register and would
      // still be priced by anything reading the whole store.
      if ((await db.get('employees', rate.employeeId)) === undefined) {
        throw new Error(`Cannot save a rate for unknown employee "${rate.employeeId}"`);
      }
      await db.put('rates', rate);
    },

    removeRate: (rateId) => db.delete('rates', rateId),
  };
}
