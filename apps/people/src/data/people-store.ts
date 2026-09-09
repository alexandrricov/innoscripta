/**
 * What People owns, and the only way to reach it.
 *
 * Every method is asynchronous even though the first implementation keeps
 * everything in memory. That is on purpose: the interface has the shape an HTTP
 * client would have, so this is the seam a real backend attaches at and nothing
 * above it changes. IndexedDB slots in behind the same interface, and tests use
 * an in-memory one.
 *
 * Delivery has no equivalent of this file and never will. It does not hold rate
 * records; it asks People what an amount of hours costs.
 */

import type { CalendarDay } from '@baseline/domain';

/** An employee as the register knows them. */
export interface Employee {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly weeklyHours: number;
}

/**
 * One entry of an employee's cost-rate history, as stored.
 *
 * The domain's `RateRecord` carries only `validFrom` and `hourlyCost`, because
 * that is all the arithmetic needs. This adds the identity the register needs to
 * edit and remove a record. TypeScript's structural typing means a `StoredRate`
 * is already a valid `RateRecord`, so no mapping is needed when handing history
 * to the domain.
 */
export interface StoredRate {
  readonly id: string;
  readonly employeeId: string;
  readonly validFrom: CalendarDay;
  readonly hourlyCost: number;
}

export interface PeopleStore {
  listEmployees(): Promise<readonly Employee[]>;
  getEmployee(employeeId: string): Promise<Employee | undefined>;

  /** The employee's history, oldest first. */
  listRates(employeeId: string): Promise<readonly StoredRate[]>;
  /** Adds a record, or replaces the one with the same id. */
  saveRate(rate: StoredRate): Promise<void>;
  removeRate(rateId: string): Promise<void>;
}
