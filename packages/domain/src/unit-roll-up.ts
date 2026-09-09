/**
 * Rolling the grid up in whichever unit is on screen (rules R2 and R4).
 *
 * The thing worth understanding here: for three of the four units a parent's
 * value cannot be computed from the parent's own hours. It has to be summed
 * from the assignments below it.
 *
 * A work package holding 220 hours of three different people has no person-month
 * size and no hourly rate of its own:
 *
 *     Design            220.00 h
 *       Anja Keller      28.16 h  / 140.8  (32 h/week)  = 0.20 person-months
 *       Clara Bergmann   88.00 h  / 176.0  (40 h/week)  = 0.50
 *       Milan Brandt    103.84 h  / 176.0  (40 h/week)  = 0.59
 *                                                         ----
 *     Design in person-months                             1.29
 *
 * `220 / what?` has no answer. So conversion happens on the assignment, where a
 * person is known, and addition happens above it. Cost works the same way, for
 * the same reason.
 *
 * % of capacity does not aggregate in either direction, and both halves of that
 * matter. Down the tree, a work package has no month of its own to be a
 * percentage of - two people at 50% each are not "100% loaded". Along the row,
 * six months at 50% are not "300%": a percentage of one month cannot be added
 * to a percentage of another. So percent has cells on assignment rows and
 * nothing anywhere else.
 */

import type { BreakdownRow } from './breakdown.ts';
import type { YearMonth } from './calendar.ts';
import { type GridUnit, type MonthBasis, toUnit } from './units.ts';

/** What the rate owner can say about one person's month. */
export interface AssignmentBasis {
  readonly basis: MonthBasis;
  /** True when some working day of that month has no rate behind it. */
  readonly hasUnpricedDays: boolean;
}

/**
 * The seam where the rate owner plugs in.
 *
 * Synchronous by design: whoever owns the rates resolves the visible pairs
 * first and hands over a plain lookup. Nothing here reaches over the network
 * mid-walk. `undefined` means the answer is unavailable, not that it is zero.
 */
export type BasisLookup = (employeeId: string, month: YearMonth) => AssignmentBasis | undefined;

export interface UnitRowValues {
  /**
   * Aligned to the horizon. `null` where the unit says nothing about this row:
   * % of capacity on a derived row, or any unit but hours when the rate owner
   * is unreachable.
   */
  readonly byMonth: readonly (number | null)[];
  /** Null when any month of the row is. */
  readonly total: number | null;
  /** True when hours below this row have no rate behind them. */
  readonly hasUnpricedHours: boolean;
}

/**
 * Values for every row of the tree, in `unit`.
 *
 * Keyed by the row objects themselves, so the row types stay free of display
 * concerns and a caller with no rate source still gets hours.
 */
export function rollUpInUnit(
  roots: readonly BreakdownRow[],
  unit: GridUnit,
  basisOf: BasisLookup,
  horizon: readonly YearMonth[],
): ReadonlyMap<BreakdownRow, UnitRowValues> {
  const values = new Map<BreakdownRow, UnitRowValues>();
  roots.forEach((root) => {
    valueOf(root, unit, basisOf, horizon, values);
  });
  return values;
}

function valueOf(
  row: BreakdownRow,
  unit: GridUnit,
  basisOf: BasisLookup,
  horizon: readonly YearMonth[],
  values: Map<BreakdownRow, UnitRowValues>,
): UnitRowValues {
  if (row.hoursByMonth.length !== horizon.length) {
    throw new RangeError(
      `A row has ${String(row.hoursByMonth.length)} months but the horizon has ${String(horizon.length)}`,
    );
  }

  const computed =
    row.kind === 'assignment'
      ? assignmentValues(row, unit, basisOf, horizon)
      : itemValues(row, unit, basisOf, horizon, values);

  values.set(row, computed);
  return computed;
}

function assignmentValues(
  row: Extract<BreakdownRow, { kind: 'assignment' }>,
  unit: GridUnit,
  basisOf: BasisLookup,
  horizon: readonly YearMonth[],
): UnitRowValues {
  const byMonth: (number | null)[] = [];
  let hasUnpricedHours = false;

  horizon.forEach((month, column) => {
    const hours = row.hoursByMonth[column] ?? 0;

    // Hours need nobody. That is the whole reason they are the stored unit.
    if (unit === 'hours') {
      byMonth.push(hours);
      return;
    }

    const known = basisOf(row.employeeId, month);
    if (!known) {
      byMonth.push(null);
      return;
    }

    // An empty cell is not an unpriced one: there are no hours to price.
    if (hours > 0 && known.hasUnpricedDays) {
      hasUnpricedHours = true;
    }

    byMonth.push(toUnit(hours, unit, known.basis));
  });

  return {
    byMonth,
    // Adding percentages of different months would produce a number with no
    // meaning - six months at 50% is not 300% of anything.
    total: unit === 'percent' ? null : sumOrNull(byMonth),
    hasUnpricedHours,
  };
}

function itemValues(
  row: Extract<BreakdownRow, { kind: 'item' }>,
  unit: GridUnit,
  basisOf: BasisLookup,
  horizon: readonly YearMonth[],
  values: Map<BreakdownRow, UnitRowValues>,
): UnitRowValues {
  const children = row.children.map((child) => valueOf(child, unit, basisOf, horizon, values));
  const hasUnpricedHours = children.some((child) => child.hasUnpricedHours);

  // A percentage of a work package's capacity is not a thing. Reporting a sum
  // of percentages would read as a load figure and mean nothing.
  if (unit === 'percent') {
    return { byMonth: horizon.map(() => null), total: null, hasUnpricedHours };
  }

  const byMonth = horizon.map((_month, column) => {
    let total = 0;
    for (const child of children) {
      const value = child.byMonth[column] ?? null;
      if (value === null) {
        // One unknown child makes the parent unknown rather than understated.
        return null;
      }
      total += value;
    }
    return total;
  });

  return { byMonth, total: sumOrNull(byMonth), hasUnpricedHours };
}

function sumOrNull(values: readonly (number | null)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) {
      return null;
    }
    total += value;
  }
  return total;
}
