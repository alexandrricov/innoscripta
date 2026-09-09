import { describe, expect, it } from 'vitest';

import { allocationCost } from './allocation-cost.ts';
import {
  type Allocation,
  type BreakdownItem,
  type BreakdownRow,
  type ItemRow,
  rollUpHours,
} from './breakdown.ts';
import { parseCalendarDay, type YearMonth, yearMonth } from './calendar.ts';
import { type CostOfHours, type CostTotals, rollUpCost } from './cost-roll-up.ts';
import { type RateRecord, splitMonthByRates } from './rate-schedule.ts';

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
  return { id, breakdownItemId, employeeId, month, hours };
}

/**
 * The lookup the rate owner would publish: it slices the month by rate and
 * prices the hours. Written here to show that nothing in the roll-up knows
 * where the number came from.
 */
function lookupFrom(rates: ReadonlyMap<string, readonly RateRecord[]>): CostOfHours {
  return (employeeId, month, hours) => {
    const slices = splitMonthByRates(rates.get(employeeId) ?? [], month);

    return {
      cost: allocationCost(hours, slices, month),
      hasUnpricedDays: slices.some((slice) => slice.kind === 'unpriced'),
    };
  };
}

const OKAFOR_RATES: readonly RateRecord[] = [
  { validFrom: parseCalendarDay('2025-01-01'), hourlyCost: 80 },
  { validFrom: parseCalendarDay('2026-03-12'), hourlyCost: 95 },
];

/** A flat 120 an hour, so the two people cannot share a blended rate. */
const BRANDT_RATES: readonly RateRecord[] = [
  { validFrom: parseCalendarDay('2025-01-01'), hourlyCost: 120 },
];

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

function totalsOf(
  costs: ReadonlyMap<BreakdownRow, CostTotals>,
  row: BreakdownRow | undefined,
): CostTotals {
  const totals = row === undefined ? undefined : costs.get(row);
  if (!totals) {
    throw new Error('The test fixture has no cost totals for that row');
  }
  return totals;
}

describe('pricing the reference cell through the tree', () => {
  const allocations = [allocation('a1', 'leafOne', 'okafor', MARCH_2026, 88)];
  const roots = rollUpHours(ITEMS, allocations, HORIZON);
  const costs = rollUpCost(roots, lookupFrom(new Map([['okafor', OKAFOR_RATES]])), HORIZON);
  const byId = itemsById(roots);

  it('prices 88 hours in March 2026 at 7880', () => {
    expect(totalsOf(costs, byId.get('leafOne')).costByMonth).toStrictEqual([7880, 0]);
  });

  it('carries it up to the root', () => {
    expect(totalsOf(costs, byId.get('root')).totalCost).toBe(7880);
  });

  it('leaves an untouched branch at zero', () => {
    expect(totalsOf(costs, byId.get('leafTwo'))).toStrictEqual({
      costByMonth: [0, 0],
      totalCost: 0,
      hasUnpricedHours: false,
    });
  });
});

describe('two people on one leaf', () => {
  const allocations = [
    allocation('a1', 'leafOne', 'okafor', MARCH_2026, 88),
    allocation('a2', 'leafOne', 'brandt', MARCH_2026, 88),
  ];
  const roots = rollUpHours(ITEMS, allocations, HORIZON);
  const rates = new Map([
    ['okafor', OKAFOR_RATES],
    ['brandt', BRANDT_RATES],
  ]);
  const costs = rollUpCost(roots, lookupFrom(rates), HORIZON);
  const byId = itemsById(roots);

  it('holds 176 hours that share no rate', () => {
    expect(byId.get('leafOne')?.hoursByMonth).toStrictEqual([176, 0]);
  });

  it('adds the two costs rather than pricing the hours together', () => {
    // 88 * 120 = 10560 for Brandt, 7880 for Okafor. There is no single rate
    // that turns 176 hours into 18440.
    expect(totalsOf(costs, byId.get('leafOne')).costByMonth).toStrictEqual([18440, 0]);
    expect(18440 / 176).not.toBe(80);
    expect(18440 / 176).not.toBe(120);
  });
});

describe('the lookup is only asked about real hours', () => {
  it('is never called for a derived row, and never for an empty cell', () => {
    const allocations = [
      allocation('a1', 'leafOne', 'okafor', MARCH_2026, 88),
      allocation('a2', 'leafTwo', 'brandt', yearMonth(2026, 4), 10),
    ];
    const roots = rollUpHours(ITEMS, allocations, HORIZON);

    const asked: { employeeId: string; hours: number }[] = [];
    const spy: CostOfHours = (employeeId, _month, hours) => {
      asked.push({ employeeId, hours });
      return { cost: 1, hasUnpricedDays: false };
    };

    rollUpCost(roots, spy, HORIZON);

    // Two assignments, one non-empty cell each. Four cells exist in total and
    // three rows are derived.
    expect(asked).toStrictEqual([
      { employeeId: 'okafor', hours: 88 },
      { employeeId: 'brandt', hours: 10 },
    ]);
  });
});

describe('hours with no rate behind them', () => {
  const allocations = [
    allocation('a1', 'leafOne', 'newcomer', MARCH_2026, 88),
    allocation('a2', 'leafTwo', 'okafor', MARCH_2026, 88),
  ];
  const roots = rollUpHours(ITEMS, allocations, HORIZON);
  // The newcomer's first rate starts after the month being priced.
  const rates = new Map([
    ['okafor', OKAFOR_RATES],
    ['newcomer', [{ validFrom: parseCalendarDay('2026-05-01'), hourlyCost: 70 }]],
  ]);
  const costs = rollUpCost(roots, lookupFrom(rates), HORIZON);
  const byId = itemsById(roots);

  it('costs nothing and marks the leaf', () => {
    expect(totalsOf(costs, byId.get('leafOne'))).toStrictEqual({
      costByMonth: [0, 0],
      totalCost: 0,
      hasUnpricedHours: true,
    });
  });

  it('marks the parent too, so its total does not look complete', () => {
    const root = totalsOf(costs, byId.get('root'));

    expect(root.totalCost).toBe(7880);
    expect(root.hasUnpricedHours).toBe(true);
  });

  it('leaves a fully priced sibling unmarked', () => {
    expect(totalsOf(costs, byId.get('leafTwo')).hasUnpricedHours).toBe(false);
  });
});

describe('the totals reconcile', () => {
  it('makes every row total the sum of its own months', () => {
    const allocations = [
      allocation('a1', 'leafOne', 'okafor', MARCH_2026, 88),
      allocation('a2', 'leafTwo', 'okafor', yearMonth(2026, 4), 44),
    ];
    const roots = rollUpHours(ITEMS, allocations, HORIZON);
    const costs = rollUpCost(roots, lookupFrom(new Map([['okafor', OKAFOR_RATES]])), HORIZON);

    for (const totals of costs.values()) {
      expect(totals.totalCost).toBe(totals.costByMonth.reduce((sum, cost) => sum + cost, 0));
    }
  });
});

describe('rejected input', () => {
  const roots = rollUpHours(
    ITEMS,
    [allocation('a1', 'leafOne', 'okafor', MARCH_2026, 88)],
    HORIZON,
  );

  it('refuses a horizon that does not match the rows', () => {
    expect(() => rollUpCost(roots, lookupFrom(new Map()), [MARCH_2026])).toThrow(RangeError);
  });

  it('refuses a lookup that answers with something that is not money', () => {
    const negative: CostOfHours = () => ({ cost: -1, hasUnpricedDays: false });
    const notANumber: CostOfHours = () => ({ cost: Number.NaN, hasUnpricedDays: false });

    expect(() => rollUpCost(roots, negative, HORIZON)).toThrow(RangeError);
    expect(() => rollUpCost(roots, notANumber, HORIZON)).toThrow(RangeError);
  });
});
