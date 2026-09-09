/**
 * What People publishes to the rest of the suite.
 *
 * Exposed through Module Federation as `./contract`, so Delivery resolves this
 * remote's URL from the same runtime configuration and loads it over the
 * network. No source is shared between the apps.
 *
 * Notice what does not appear in the answers: a rate record. The rule for
 * splitting a month across rate changes - `validFrom` is inclusive, working
 * days on each side, a month before the first rate costs nothing - runs here
 * and only here. What leaves is the blended price of an hour and the size of a
 * person-month, which is all a consumer needs for any of the four units, in
 * either direction.
 */

import {
  CONTRACT_VERSION,
  type EmployeeMonthRef,
  type EmployeeSummary,
  type MonthPricing,
  type PeopleContract,
  pricingKey,
  type PricingSnapshot,
} from '@baseline/contracts';
import {
  blendedHourlyRate,
  parseYearMonth,
  personMonthHours,
  splitMonthByRates,
} from '@baseline/domain';

import { onPeopleChanged } from './data/store-changes.ts';
import { peopleStore } from './data/store-instance.ts';

export const contract: PeopleContract = {
  version: CONTRACT_VERSION,

  employees: async (): Promise<readonly EmployeeSummary[]> => {
    const store = await peopleStore();

    return (await store.listEmployees()).map((employee) => ({
      id: employee.id,
      name: employee.name,
      role: employee.role,
      weeklyHours: employee.weeklyHours,
    }));
  },

  pricing: async (wanted: readonly EmployeeMonthRef[]): Promise<PricingSnapshot> => {
    const store = await peopleStore();
    const employees = new Map(
      (await store.listEmployees()).map((employee) => [employee.id, employee]),
    );

    // One read of the history per employee, however many of their months were
    // asked about.
    const historyOf = new Map<string, Awaited<ReturnType<typeof store.listRates>>>();
    for (const employeeId of new Set(wanted.map((ref) => ref.employeeId))) {
      historyOf.set(employeeId, await store.listRates(employeeId));
    }

    const snapshot = new Map<string, MonthPricing>();

    for (const ref of wanted) {
      const employee = employees.get(ref.employeeId);
      if (!employee) {
        // Asking about somebody who is not in the register is not worth failing
        // the whole snapshot over; the pair is simply absent from it.
        continue;
      }

      const month = parseYearMonth(ref.month);
      const slices = splitMonthByRates(historyOf.get(ref.employeeId) ?? [], month);

      snapshot.set(pricingKey(ref.employeeId, ref.month), {
        personMonthHours: personMonthHours(employee.weeklyHours, month),
        blendedHourlyRate: blendedHourlyRate(slices, month),
        hasUnpricedDays: slices.some((slice) => slice.kind === 'unpriced'),
      });
    }

    return snapshot;
  },

  subscribe: onPeopleChanged,
};
