/**
 * What the two remotes publish to each other.
 *
 * The shapes live in one package because both sides have to agree on them. They
 * ship independently, so if these types existed twice they would drift apart
 * quietly and the failure would surface as `undefined is not a function` in
 * production.
 *
 * The guiding rule: each side publishes only what it owns, and nothing that
 * would let the other re-implement its rules.
 *
 * - People owns the register and the rate history, so it publishes the size of a
 *   person-month and the blended price of an hour. No rate record crosses the
 *   boundary, and the rule for splitting a month across rate changes stays in
 *   one application.
 * - Delivery owns the plan, so it publishes hours allocated per person-month
 *   across every project. It does not publish a verdict on capacity, because
 *   capacity is `weeklyHours * workingDays / 5` and that is People's data.
 *
 * That division is what keeps the dependency acyclic. Each side computes its own
 * conclusion from its own rules: People decides who is oversubscribed, Delivery
 * decides which cell to flag and which assignment to name.
 */

/** An employee as everyone outside People needs to know them. */
export interface EmployeeSummary {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly weeklyHours: number;
}

/** Everything needed to convert and price one person's month. */
export interface MonthPricing {
  /** `weeklyHours * workingDays / 5`. Varies by person and by month. */
  readonly personMonthHours: number;
  /**
   * The average price of an hour that month, weighted by working days at each
   * rate. Zero when the month carries no priced day.
   *
   * Cost is `hours * this`, and hours are `cost / this`. Both hold because the
   * blended rate does not depend on the size of the allocation.
   */
  readonly blendedHourlyRate: number;
  /** True when some working day of the month has no rate behind it. */
  readonly hasUnpricedDays: boolean;
}

export interface EmployeeMonthRef {
  readonly employeeId: string;
  /** `YYYY-MM`. */
  readonly month: string;
}

/** Keyed with `pricingKey`, so both sides compose the key the same way. */
export type PricingSnapshot = ReadonlyMap<string, MonthPricing>;

/** Hours allocated to one person in one month, summed across every project. */
export type AllocatedHoursSnapshot = ReadonlyMap<string, number>;

export function pricingKey(employeeId: string, month: string): string {
  return `${employeeId}|${month}`;
}

/**
 * Bumped when a shape here changes incompatibly.
 *
 * Checked on load, so a mismatch after an independent deploy shows up as one
 * clear message instead of a missing method somewhere deep in a render.
 */
export const CONTRACT_VERSION = 1;

export interface PeopleContract {
  readonly version: typeof CONTRACT_VERSION;
  employees(): Promise<readonly EmployeeSummary[]>;
  /**
   * Priced in one call for every pair the caller can see.
   *
   * A call per cell would be up to two thousand round trips for one grid. The
   * consumer takes a snapshot and then reads it synchronously, which is also
   * what lets the domain's tree walk stay synchronous.
   */
  pricing(wanted: readonly EmployeeMonthRef[]): Promise<PricingSnapshot>;
  /** Called after any change to the register. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export interface DeliveryContract {
  readonly version: typeof CONTRACT_VERSION;
  /** Not bounded by the grid's horizon: a person is busy whatever is on screen. */
  allocatedHours(): Promise<AllocatedHoursSnapshot>;
  subscribe(listener: () => void): () => void;
}
