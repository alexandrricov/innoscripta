import { describe, expect, it } from 'vitest';

import { allocationCost, blendedHourlyRate } from './allocation-cost.ts';
import {
  type Allocation,
  type BreakdownItem,
  type BreakdownRow,
  type ItemRow,
  rollUpHours,
} from './breakdown.ts';
import { parseCalendarDay, type YearMonth, yearMonth } from './calendar.ts';
import { personMonthHours } from './person-month.ts';
import { splitMonthByRates } from './rate-schedule.ts';
import { type AssignmentBasis, type BasisLookup, rollUpInUnit } from './unit-roll-up.ts';
import type { GridUnit } from './units.ts';

const MARCH_2026 = yearMonth(2026, 3);
const HORIZON = [MARCH_2026, yearMonth(2026, 4)];

const ITEMS: readonly BreakdownItem[] = [
  { id: 'root', projectId: 'p1', parentId: null, name: 'Ledger migration' },
  { id: 'leafOne', projectId: 'p1', parentId: 'root', name: 'Schema' },
  { id: 'leafTwo', projectId: 'p1', parentId: 'root', name: 'Mapping' },
];

function allocation(
  id: string,
  breakdownItemId: string,
  employeeId: string,
  month: YearMonth,
  hours: number,
): Allocation {
  return { id, breakdownItemId, employeeId, month, hours, editedAt: 0 };
}

/** A. Okafor: 40 h/week, 80 then 95 an hour from 12 March. */
const OKAFOR_SLICES = splitMonthByRates(
  [
    { validFrom: parseCalendarDay('2025-01-01'), hourlyCost: 80 },
    { validFrom: parseCalendarDay('2026-03-12'), hourlyCost: 95 },
  ],
  MARCH_2026,
);

/** A newcomer whose first rate starts after March, so March has no rate. */
const NEWCOMER_SLICES = splitMonthByRates(
  [{ validFrom: parseCalendarDay('2026-05-01'), hourlyCost: 70 }],
  MARCH_2026,
);

const BASES: Record<string, AssignmentBasis> = {
  okafor: {
    basis: {
      personMonthHours: personMonthHours(40, MARCH_2026),
      blendedHourlyRate: blendedHourlyRate(OKAFOR_SLICES, MARCH_2026),
    },
    hasUnpricedDays: false,
  },
  // 32 h/week, so a different person-month: this is what makes a parent
  // impossible to convert from its own hours.
  haddad: {
    basis: {
      personMonthHours: personMonthHours(32, MARCH_2026),
      blendedHourlyRate: 120,
    },
    hasUnpricedDays: false,
  },
  newcomer: {
    basis: {
      personMonthHours: personMonthHours(40, MARCH_2026),
      blendedHourlyRate: blendedHourlyRate(NEWCOMER_SLICES, MARCH_2026),
    },
    hasUnpricedDays: true,
  },
};

const knownBases: BasisLookup = (employeeId) => BASES[employeeId];
const noBases: BasisLookup = () => undefined;

function itemsById(roots: readonly ItemRow[]): ReadonlyMap<string, ItemRow> {
  const collected = new Map<string, ItemRow>();
  const walk = (row: BreakdownRow): void => {
    if (row.kind !== 'item') {
      return;
    }
    collected.set(row.id, row);
    row.children.forEach(walk);
  };
  roots.forEach(walk);
  return collected;
}

function assignmentOf(roots: readonly ItemRow[], employeeId: string): BreakdownRow {
  const found: BreakdownRow[] = [];
  const walk = (row: BreakdownRow): void => {
    if (row.kind === 'assignment') {
      if (row.employeeId === employeeId) {
        found.push(row);
      }
      return;
    }
    row.children.forEach(walk);
  };
  roots.forEach(walk);

  const first = found[0];
  if (!first) {
    throw new Error(`No assignment row for "${employeeId}"`);
  }
  return first;
}

function valuesFor(unit: GridUnit, lookup: BasisLookup = knownBases) {
  const allocations = [
    allocation('a1', 'leafOne', 'okafor', MARCH_2026, 88),
    allocation('a2', 'leafOne', 'haddad', MARCH_2026, 70.4),
    allocation('a3', 'leafTwo', 'okafor', yearMonth(2026, 4), 44),
  ];
  const roots = rollUpHours(ITEMS, allocations, HORIZON);

  return { roots, byId: itemsById(roots), values: rollUpInUnit(roots, unit, lookup, HORIZON) };
}

describe('hours', () => {
  it('are the stored value, unchanged', () => {
    const { roots, byId, values } = valuesFor('hours');

    expect(values.get(assignmentOf(roots, 'okafor'))?.byMonth).toStrictEqual([88, 0]);
    expect(values.get(byId.get('leafOne') as BreakdownRow)?.byMonth).toStrictEqual([158.4, 0]);
    expect(values.get(byId.get('root') as BreakdownRow)?.total).toBeCloseTo(202.4, 10);
  });

  it('need no rate owner at all', () => {
    const { byId, values } = valuesFor('hours', noBases);

    expect(values.get(byId.get('root') as BreakdownRow)?.byMonth).toStrictEqual([158.4, 44]);
  });
});

describe('person-months', () => {
  it('are summed from the assignments, not divided out of the parent hours', () => {
    const { byId, values } = valuesFor('personMonths');

    const leaf = values.get(byId.get('leafOne') as BreakdownRow);

    // 88/176 = 0.50 for Okafor plus 70.4/140.8 = 0.50 for Haddad.
    expect(leaf?.byMonth[0]).toBeCloseTo(1, 10);

    // The leaf holds 158.4 hours. Dividing those by either person-month gives
    // 0.9 or 1.125, and neither is the answer.
    expect(158.4 / 176).not.toBeCloseTo(1, 2);
    expect(158.4 / 140.8).not.toBeCloseTo(1, 2);
  });

  it('are unavailable without the rate owner, rather than wrong', () => {
    const { byId, values } = valuesFor('personMonths', noBases);

    expect(values.get(byId.get('root') as BreakdownRow)?.byMonth).toStrictEqual([null, null]);
    expect(values.get(byId.get('root') as BreakdownRow)?.total).toBeNull();
  });
});

describe('cost', () => {
  it('prices the reference cell at 7880', () => {
    const { roots, values } = valuesFor('cost');

    expect(values.get(assignmentOf(roots, 'okafor'))?.byMonth[0]).toBe(7880);
  });

  it('agrees with pricing the month slice by slice', () => {
    const { roots, values } = valuesFor('cost');

    expect(values.get(assignmentOf(roots, 'okafor'))?.byMonth[0]).toBeCloseTo(
      allocationCost(88, OKAFOR_SLICES, MARCH_2026),
      8,
    );
  });

  it('adds the two people rather than pricing the parent hours together', () => {
    const { byId, values } = valuesFor('cost');

    // 7880 for Okafor plus 70.4 * 120 = 8448 for Haddad.
    expect(values.get(byId.get('leafOne') as BreakdownRow)?.byMonth[0]).toBeCloseTo(16328, 8);
    expect(16328 / 158.4).not.toBeCloseTo(BASES.okafor?.basis.blendedHourlyRate ?? 0, 2);
    expect(16328 / 158.4).not.toBeCloseTo(120, 2);
  });
});

describe('% of capacity', () => {
  it('is a percentage of that person month on an assignment row', () => {
    const { roots, values } = valuesFor('percent');

    expect(values.get(assignmentOf(roots, 'okafor'))?.byMonth[0]).toBe(50);
    expect(values.get(assignmentOf(roots, 'haddad'))?.byMonth[0]).toBeCloseTo(50, 10);
  });

  it('is nothing at all on a derived row', () => {
    const { byId, values } = valuesFor('percent');

    // Two people at 50% each are not "100% loaded", and a work package has no
    // month of its own to be a percentage of.
    expect(values.get(byId.get('leafOne') as BreakdownRow)?.byMonth).toStrictEqual([null, null]);
    expect(values.get(byId.get('root') as BreakdownRow)?.total).toBeNull();
  });
});

describe('unpriced hours', () => {
  it('are flagged on the month that holds them, not just on the row', () => {
    // R1: an allocation in a month before the employee's first rate costs zero
    // and the cell is marked. March is unpriced for this newcomer, April is not
    // in their horizon at all, so only the first column carries the flag.
    const allocations = [allocation('a1', 'leafOne', 'newcomer', MARCH_2026, 88)];
    const roots = rollUpHours(ITEMS, allocations, HORIZON);
    const values = rollUpInUnit(roots, 'cost', knownBases, HORIZON);
    const byId = itemsById(roots);

    expect(values.get(assignmentOf(roots, 'newcomer'))?.unpricedByMonth).toStrictEqual([
      true,
      false,
    ]);
    expect(values.get(byId.get('root') as BreakdownRow)?.unpricedByMonth).toStrictEqual([
      true,
      false,
    ]);
    expect(values.get(byId.get('leafTwo') as BreakdownRow)?.unpricedByMonth).toStrictEqual([
      false,
      false,
    ]);
  });

  it('are not a concern of any unit but cost', () => {
    // A person-month is well defined without a rate, so calling that cell
    // unpriced would be noise about a number that is exactly right.
    const allocations = [allocation('a1', 'leafOne', 'newcomer', MARCH_2026, 88)];
    const roots = rollUpHours(ITEMS, allocations, HORIZON);

    for (const unit of ['hours', 'personMonths', 'percent'] as const) {
      const values = rollUpInUnit(roots, unit, knownBases, HORIZON);
      expect(values.get(assignmentOf(roots, 'newcomer'))?.hasUnpricedHours).toBe(false);
    }
  });

  it('are flagged on the assignment and carried up the tree', () => {
    const allocations = [allocation('a1', 'leafOne', 'newcomer', MARCH_2026, 88)];
    const roots = rollUpHours(ITEMS, allocations, HORIZON);
    const values = rollUpInUnit(roots, 'cost', knownBases, HORIZON);
    const byId = itemsById(roots);

    expect(values.get(assignmentOf(roots, 'newcomer'))?.hasUnpricedHours).toBe(true);
    expect(values.get(byId.get('leafOne') as BreakdownRow)?.hasUnpricedHours).toBe(true);
    expect(values.get(byId.get('root') as BreakdownRow)?.hasUnpricedHours).toBe(true);
    expect(values.get(byId.get('leafTwo') as BreakdownRow)?.hasUnpricedHours).toBe(false);
  });

  it('are not flagged for an empty cell, since there are no hours to price', () => {
    const allocations = [allocation('a1', 'leafOne', 'newcomer', yearMonth(2026, 4), 0)];
    const roots = rollUpHours(ITEMS, allocations, HORIZON);
    const values = rollUpInUnit(roots, 'cost', knownBases, HORIZON);

    expect(values.get(assignmentOf(roots, 'newcomer'))?.hasUnpricedHours).toBe(false);
  });
});

describe('every row reconciles along its own months', () => {
  it('has a total equal to the sum of its months, in every unit', () => {
    for (const unit of ['hours', 'personMonths', 'cost'] as const) {
      const { values } = valuesFor(unit);

      for (const row of values.values()) {
        const months = row.byMonth.reduce((sum, value) => (sum ?? 0) + (value ?? 0), 0) ?? 0;
        expect(row.total).toBeCloseTo(months, 8);
      }
    }
  });
});

describe('rejected input', () => {
  it('refuses a horizon that does not match the rows', () => {
    const { roots } = valuesFor('hours');

    expect(() => rollUpInUnit(roots, 'hours', knownBases, [MARCH_2026])).toThrow(RangeError);
  });
});

describe('% of capacity does not add up along the row either', () => {
  it('has no total on an assignment row', () => {
    const { roots, values } = valuesFor('percent');

    const okafor = values.get(assignmentOf(roots, 'okafor'));

    // The months are meaningful individually and meaningless added together:
    // 50% of March plus 50% of April is not 100% of anything.
    expect(okafor?.byMonth[0]).toBe(50);
    expect(okafor?.total).toBeNull();
  });

  it('still has a total in every other unit', () => {
    for (const unit of ['hours', 'personMonths', 'cost'] as const) {
      const { roots, values } = valuesFor(unit);

      expect(values.get(assignmentOf(roots, 'okafor'))?.total).not.toBeNull();
    }
  });
});
