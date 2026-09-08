import { describe, expect, it } from 'vitest';

import {
  type Allocation,
  type AssignmentRow,
  type BreakdownItem,
  type BreakdownRow,
  type ItemRow,
  rollUpHours,
} from './breakdown.ts';
import { yearMonth } from './calendar.ts';

const HORIZON = [yearMonth(2026, 4), yearMonth(2026, 5), yearMonth(2026, 6)];

/**
 *   root
 *     mid
 *       leafOne
 *       leafTwo
 *   emptyRoot
 */
const ITEMS: readonly BreakdownItem[] = [
  { id: 'root', projectId: 'p1', parentId: null, name: 'Ledger migration' },
  { id: 'mid', projectId: 'p1', parentId: 'root', name: 'Design' },
  { id: 'leafOne', projectId: 'p1', parentId: 'mid', name: 'Schema' },
  { id: 'leafTwo', projectId: 'p1', parentId: 'mid', name: 'Mapping' },
  { id: 'emptyRoot', projectId: 'p1', parentId: null, name: 'Reporting cut-over' },
];

function allocation(
  id: string,
  breakdownItemId: string,
  employeeId: string,
  month: YearMonthTuple,
  hours: number,
): Allocation {
  return { id, breakdownItemId, employeeId, month: yearMonth(...month), hours };
}

type YearMonthTuple = readonly [year: number, month: number];

const ALLOCATIONS: readonly Allocation[] = [
  allocation('a1', 'leafOne', 'okafor', [2026, 4], 10),
  allocation('a2', 'leafOne', 'okafor', [2026, 5], 20),
  allocation('a3', 'leafOne', 'brandt', [2026, 4], 5),
  allocation('a4', 'leafTwo', 'okafor', [2026, 6], 7),
  // Before the horizon opens: the reference-calculation cell of the real seed
  // sits in March 2026 while the grid starts in April.
  allocation('a5', 'leafOne', 'okafor', [2026, 3], 100),
];

function rowsById(rows: readonly ItemRow[]): ReadonlyMap<string, ItemRow> {
  const collected = new Map<string, ItemRow>();

  const walk = (row: BreakdownRow): void => {
    if (row.kind !== 'item') {
      return;
    }
    collected.set(row.id, row);
    row.children.forEach(walk);
  };
  rows.forEach(walk);

  return collected;
}

function assignmentsOf(row: ItemRow): readonly AssignmentRow[] {
  return row.children.filter((child): child is AssignmentRow => child.kind === 'assignment');
}

/** Fails the test loudly instead of asserting against `undefined`. */
function itemRow(rows: ReadonlyMap<string, ItemRow>, id: string): ItemRow {
  const row = rows.get(id);
  if (!row) {
    throw new Error(`The test fixture has no row for "${id}"`);
  }
  return row;
}

describe('rolling hours up the tree', () => {
  const roots = rollUpHours(ITEMS, ALLOCATIONS, HORIZON);
  const byId = rowsById(roots);

  it('returns the roots in the order they arrived', () => {
    expect(roots.map((root) => root.id)).toStrictEqual(['root', 'emptyRoot']);
  });

  it('gives each person their own editable row under the leaf', () => {
    expect(assignmentsOf(itemRow(byId, 'leafOne'))).toStrictEqual([
      {
        kind: 'assignment',
        breakdownItemId: 'leafOne',
        employeeId: 'okafor',
        hoursByMonth: [10, 20, 0],
        totalHours: 30,
      },
      {
        kind: 'assignment',
        breakdownItemId: 'leafOne',
        employeeId: 'brandt',
        hoursByMonth: [5, 0, 0],
        totalHours: 5,
      },
    ]);
  });

  it('sums the people into the leaf', () => {
    expect(byId.get('leafOne')?.hoursByMonth).toStrictEqual([15, 20, 0]);
    expect(byId.get('leafTwo')?.hoursByMonth).toStrictEqual([0, 0, 7]);
  });

  it('sums the leaves into the parent and the parent into the root', () => {
    expect(byId.get('mid')?.hoursByMonth).toStrictEqual([15, 20, 7]);
    expect(byId.get('root')?.hoursByMonth).toStrictEqual([15, 20, 7]);
  });

  it('makes the TOTAL column the sum of the month columns, at every level', () => {
    for (const row of byId.values()) {
      expect(row.totalHours).toBe(row.hoursByMonth.reduce((sum, hours) => sum + hours, 0));
    }
    expect(byId.get('root')?.totalHours).toBe(42);
  });

  it('keeps an item with no allocations as a row of zeros', () => {
    expect(byId.get('emptyRoot')).toStrictEqual({
      kind: 'item',
      id: 'emptyRoot',
      name: 'Reporting cut-over',
      children: [],
      hoursByMonth: [0, 0, 0],
      totalHours: 0,
    });
  });
});

describe('allocations outside the horizon', () => {
  it('leaves them out of the columns and out of the total', () => {
    const byId = rowsById(rollUpHours(ITEMS, ALLOCATIONS, HORIZON));

    // a5 puts 100 hours in March 2026, before the horizon opens. Were it
    // counted in the total but not shown in a column, the displayed total would
    // stop matching the displayed cells, which rule R3 forbids.
    expect(byId.get('leafOne')?.totalHours).toBe(35);
    expect(byId.get('root')?.totalHours).toBe(42);
  });

  it('includes them once the horizon covers their month', () => {
    const wider = [yearMonth(2026, 3), ...HORIZON];
    const byId = rowsById(rollUpHours(ITEMS, ALLOCATIONS, wider));

    expect(byId.get('leafOne')?.hoursByMonth).toStrictEqual([100, 15, 20, 0]);
    expect(byId.get('root')?.totalHours).toBe(142);
  });
});

describe('the same person in more than one place', () => {
  it('gets a separate row per piece of work', () => {
    const byId = rowsById(rollUpHours(ITEMS, ALLOCATIONS, HORIZON));

    expect(assignmentsOf(itemRow(byId, 'leafOne')).map((row) => row.employeeId)).toStrictEqual([
      'okafor',
      'brandt',
    ]);
    expect(assignmentsOf(itemRow(byId, 'leafTwo')).map((row) => row.employeeId)).toStrictEqual([
      'okafor',
    ]);
  });
});

describe('an item carrying both children and its own allocation', () => {
  it('adds its own effort to its children rather than losing it', () => {
    const withOwn = [...ALLOCATIONS, allocation('a6', 'mid', 'haddad', [2026, 4], 3)];
    const byId = rowsById(rollUpHours(ITEMS, withOwn, HORIZON));

    expect(byId.get('mid')?.hoursByMonth).toStrictEqual([18, 20, 7]);
    expect(byId.get('root')?.hoursByMonth).toStrictEqual([18, 20, 7]);
  });

  it('puts the child items before the assignments', () => {
    const withOwn = [...ALLOCATIONS, allocation('a6', 'mid', 'haddad', [2026, 4], 3)];
    const byId = rowsById(rollUpHours(ITEMS, withOwn, HORIZON));

    expect(byId.get('mid')?.children.map((child) => child.kind)).toStrictEqual([
      'item',
      'item',
      'assignment',
    ]);
  });
});

describe('broken data', () => {
  it('refuses an allocation pointing at an unknown item', () => {
    const broken = [allocation('x', 'nope', 'okafor', [2026, 4], 1)];

    expect(() => rollUpHours(ITEMS, broken, HORIZON)).toThrow(RangeError);
  });

  it('refuses an unknown parentId', () => {
    const broken: BreakdownItem[] = [{ id: 'a', projectId: 'p1', parentId: 'ghost', name: 'A' }];

    expect(() => rollUpHours(broken, [], HORIZON)).toThrow(RangeError);
  });

  it('refuses a parentId cycle instead of losing the effort in it', () => {
    const cyclic: BreakdownItem[] = [
      { id: 'a', projectId: 'p1', parentId: 'b', name: 'A' },
      { id: 'b', projectId: 'p1', parentId: 'a', name: 'B' },
    ];

    expect(() => rollUpHours(cyclic, [], HORIZON)).toThrow(/cycle/);
  });

  it('refuses a duplicate item id', () => {
    const duplicated: BreakdownItem[] = [
      { id: 'a', projectId: 'p1', parentId: null, name: 'A' },
      { id: 'a', projectId: 'p1', parentId: null, name: 'Also A' },
    ];

    expect(() => rollUpHours(duplicated, [], HORIZON)).toThrow(RangeError);
  });

  it('refuses hours that cannot exist', () => {
    expect(() =>
      rollUpHours(ITEMS, [allocation('x', 'leafOne', 'okafor', [2026, 4], -1)], HORIZON),
    ).toThrow(RangeError);
    expect(() =>
      rollUpHours(ITEMS, [allocation('x', 'leafOne', 'okafor', [2026, 4], Number.NaN)], HORIZON),
    ).toThrow(RangeError);
  });
});
