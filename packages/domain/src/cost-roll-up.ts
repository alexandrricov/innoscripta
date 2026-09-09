/**
 * Rolling cost up the work breakdown (domain rules R1 and R4).
 *
 * Hours add up; cost adds up too, but cost cannot be derived from a parent's
 * hours. An hour costs what the person costs, so a leaf holding 88 hours of one
 * person and 88 of another has no single rate behind its 176 hours. Cost is
 * therefore computed on the assignment and summed upwards.
 *
 * This lives apart from `rollUpHours` on purpose. Hours need nothing from the
 * People side, cost does. Keeping them separate is what lets the grid still
 * render and stay editable in hours when the People contract is unavailable.
 * Hours are the only unit that survives that: person-months and % of capacity
 * both go through `personMonthHours`, which needs the contracted weekly hours
 * People owns.
 *
 * Note that the ownership boundary is about data, not module visibility: both
 * apps share this package, so what stops Delivery pricing the grid itself is
 * that it never holds the rate records, not that it cannot see the functions.
 */

import type { BreakdownRow } from './breakdown.ts';
import type { YearMonth } from './calendar.ts';

/** What a lookup answers for one person, one month, one amount of hours. */
export interface HoursCost {
  /** What those hours cost. Hours with no rate behind them add nothing. */
  readonly cost: number;
  /**
   * True when some working day of that month carries no rate at all - the
   * month sits partly or wholly before the employee's first rate record.
   */
  readonly hasUnpricedDays: boolean;
}

/**
 * The seam where the rate owner plugs in.
 *
 * Synchronous by design. Whoever owns the rates resolves the costs for the
 * visible pairs first and passes a plain lookup in; nothing here reaches over
 * the network mid-walk.
 */
export type CostOfHours = (employeeId: string, month: YearMonth, hours: number) => HoursCost;

export interface CostTotals {
  /** Aligned to the horizon, one entry per column. */
  readonly costByMonth: readonly number[];
  /** The sum of `costByMonth`, which is what the TOTAL column shows. */
  readonly totalCost: number;
  /** True when any hours below this row have no rate behind them. */
  readonly hasUnpricedHours: boolean;
}

/**
 * Prices every row of the tree.
 *
 * Keyed by the row objects themselves rather than returning a parallel tree, so
 * the row types stay free of cost fields and a caller with no rate source
 * simply has no map. `costs.get(row)` returning nothing means cost is
 * unavailable, which is exactly the state a failed remote leaves behind.
 */
export function rollUpCost(
  roots: readonly BreakdownRow[],
  costOf: CostOfHours,
  horizon: readonly YearMonth[],
): ReadonlyMap<BreakdownRow, CostTotals> {
  const costs = new Map<BreakdownRow, CostTotals>();
  roots.forEach((root) => {
    priceRow(root, costOf, horizon, costs);
  });
  return costs;
}

function priceRow(
  row: BreakdownRow,
  costOf: CostOfHours,
  horizon: readonly YearMonth[],
  costs: Map<BreakdownRow, CostTotals>,
): CostTotals {
  if (row.hoursByMonth.length !== horizon.length) {
    throw new RangeError(
      `A row has ${String(row.hoursByMonth.length)} months but the horizon has ${String(horizon.length)}`,
    );
  }

  const totals =
    row.kind === 'assignment'
      ? priceAssignment(row, costOf, horizon)
      : priceItem(row, costOf, horizon, costs);

  costs.set(row, totals);
  return totals;
}

function priceAssignment(
  row: Extract<BreakdownRow, { kind: 'assignment' }>,
  costOf: CostOfHours,
  horizon: readonly YearMonth[],
): CostTotals {
  const costByMonth: number[] = [];
  let hasUnpricedHours = false;

  horizon.forEach((month, column) => {
    const hours = row.hoursByMonth[column] ?? 0;

    // An empty cell is not an unpriced one. There are no hours to price, so
    // asking is pointless and marking it would be a false flag - and most cells
    // of a real grid are empty.
    if (hours === 0) {
      costByMonth.push(0);
      return;
    }

    const priced = costOf(row.employeeId, month, hours);
    if (!Number.isFinite(priced.cost) || priced.cost < 0) {
      throw new RangeError(
        `Cost lookup returned ${String(priced.cost)} for employee "${row.employeeId}"`,
      );
    }

    costByMonth.push(priced.cost);
    hasUnpricedHours = hasUnpricedHours || priced.hasUnpricedDays;
  });

  return { costByMonth, totalCost: sum(costByMonth), hasUnpricedHours };
}

function priceItem(
  row: Extract<BreakdownRow, { kind: 'item' }>,
  costOf: CostOfHours,
  horizon: readonly YearMonth[],
  costs: Map<BreakdownRow, CostTotals>,
): CostTotals {
  const costByMonth = new Array<number>(horizon.length).fill(0);
  let hasUnpricedHours = false;

  for (const child of row.children) {
    const childTotals = priceRow(child, costOf, horizon, costs);

    childTotals.costByMonth.forEach((cost, column) => {
      costByMonth[column] = (costByMonth[column] ?? 0) + cost;
    });
    hasUnpricedHours = hasUnpricedHours || childTotals.hasUnpricedHours;
  }

  return { costByMonth, totalCost: sum(costByMonth), hasUnpricedHours };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
