/**
 * Cross-project capacity (domain rule R5).
 *
 * Capacity for a month is 100% of that person's person-month. Allocation is
 * summed across every project, including ones nobody currently has open. Over
 * that sum the person is oversubscribed, and the edit that got them there is
 * flagged rather than blocked - a plan is allowed to be unrealistic, the planner
 * decides what to do about it.
 *
 * This is the one calculation in the domain that takes no horizon, and that is
 * deliberate rather than an omission. The grid shows a twelve-month window and
 * its totals stop at the window's edge, but a person is either overcommitted in
 * a month or not, whatever the grid happens to be showing. There is no parameter
 * here to get that wrong with.
 *
 * It also has to run where the allocations live, which is Delivery, while R5
 * asks People to show the badge. That is why the contract between the two
 * remotes runs in both directions.
 */

import type { Allocation } from './breakdown.ts';
import { formatYearMonth, type YearMonth } from './calendar.ts';
import { personMonthHours } from './person-month.ts';

export interface CapacityLoad {
  /** Hours allocated to this person in this month, across every project. */
  readonly allocatedHours: number;
  /** One person-month for this contract in this month. */
  readonly capacityHours: number;
  readonly isOversubscribed: boolean;
  /**
   * The most recently edited allocation contributing to the month, and only
   * when the month is over capacity. Ties on `editedAt` go to the lowest id so
   * the answer does not move between renders.
   */
  readonly causingAllocationId: string | undefined;
}

interface Bucket {
  readonly month: YearMonth;
  hours: number;
  latest: Allocation | undefined;
}

/**
 * The load and capacity of every person-month that carries an allocation.
 *
 * `weeklyHoursByEmployee` must cover every employee mentioned; capacity cannot
 * be guessed from an absent contract, and treating it as zero would report
 * everybody as oversubscribed.
 *
 * Person-months with no allocation are absent from the result rather than
 * present with zeros - there is nothing to say about them.
 */
export function capacityLoad(
  allocations: readonly Allocation[],
  weeklyHoursByEmployee: ReadonlyMap<string, number>,
): ReadonlyMap<string, ReadonlyMap<string, CapacityLoad>> {
  const buckets = new Map<string, Map<string, Bucket>>();

  for (const allocation of allocations) {
    assertHours(allocation);
    assertEditedAt(allocation);

    const monthsOfEmployee = buckets.get(allocation.employeeId) ?? new Map<string, Bucket>();
    buckets.set(allocation.employeeId, monthsOfEmployee);

    const monthKey = formatYearMonth(allocation.month);
    const bucket = monthsOfEmployee.get(monthKey) ?? {
      month: allocation.month,
      hours: 0,
      latest: undefined,
    };
    monthsOfEmployee.set(monthKey, bucket);

    bucket.hours += allocation.hours;
    if (isMoreRecent(allocation, bucket.latest)) {
      bucket.latest = allocation;
    }
  }

  const load = new Map<string, ReadonlyMap<string, CapacityLoad>>();

  for (const [employeeId, monthsOfEmployee] of buckets) {
    const weeklyHours = weeklyHoursByEmployee.get(employeeId);
    if (weeklyHours === undefined) {
      throw new RangeError(
        `No contracted weekly hours for employee "${employeeId}", so capacity cannot be computed`,
      );
    }

    const months = new Map<string, CapacityLoad>();
    for (const [monthKey, bucket] of monthsOfEmployee) {
      const capacityHours = personMonthHours(weeklyHours, bucket.month);
      // Strictly greater: the spec says the sum has to exceed capacity, and
      // exactly 100% is exactly one person-month, which is fine.
      const isOversubscribed = bucket.hours > capacityHours;

      months.set(monthKey, {
        allocatedHours: bucket.hours,
        capacityHours,
        isOversubscribed,
        causingAllocationId: isOversubscribed ? bucket.latest?.id : undefined,
      });
    }
    load.set(employeeId, months);
  }

  return load;
}

function isMoreRecent(candidate: Allocation, current: Allocation | undefined): boolean {
  if (!current) {
    return true;
  }
  if (candidate.editedAt !== current.editedAt) {
    return candidate.editedAt > current.editedAt;
  }
  // Freshly imported seed data all shares one timestamp, so without a
  // tie-break the named allocation would depend on iteration order.
  return candidate.id < current.id;
}

function assertHours(allocation: Allocation): void {
  if (!Number.isFinite(allocation.hours) || allocation.hours < 0) {
    throw new RangeError(
      `Allocation "${allocation.id}" has ${String(allocation.hours)} hours, which is not a non-negative number`,
    );
  }
}

function assertEditedAt(allocation: Allocation): void {
  if (!Number.isFinite(allocation.editedAt)) {
    throw new RangeError(
      `Allocation "${allocation.id}" has a non-finite editedAt, so edits cannot be ordered`,
    );
  }
}
