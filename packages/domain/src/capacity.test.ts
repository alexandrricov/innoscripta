import { describe, expect, it } from 'vitest';

import type { Allocation } from './breakdown.ts';
import { formatYearMonth, type YearMonth, yearMonth } from './calendar.ts';
import { type CapacityLoad, capacityLoad } from './capacity.ts';
import { personMonthHours } from './person-month.ts';

const MARCH_2026 = yearMonth(2026, 3);
const JUNE_2026 = yearMonth(2026, 6);

const FULL_TIME = new Map([['okafor', 40]]);

function allocation(
  id: string,
  employeeId: string,
  month: YearMonth,
  hours: number,
  editedAt = 0,
  breakdownItemId = 'wbs-1',
): Allocation {
  return { id, breakdownItemId, employeeId, month, hours, editedAt };
}

function loadOf(
  load: ReadonlyMap<string, ReadonlyMap<string, CapacityLoad>>,
  employeeId: string,
  month: YearMonth,
): CapacityLoad {
  const found = load.get(employeeId)?.get(formatYearMonth(month));
  if (!found) {
    throw new Error(`No load recorded for "${employeeId}" in ${formatYearMonth(month)}`);
  }
  return found;
}

describe('summing across projects', () => {
  it('adds allocations that sit in different projects', () => {
    // 88 hours on one project and 88 on another is exactly one person-month for
    // a 40 h/week contract in a 22 working-day month.
    const load = capacityLoad(
      [
        allocation('a1', 'okafor', MARCH_2026, 88, 0, 'ledger-leaf'),
        allocation('a2', 'okafor', MARCH_2026, 88, 0, 'portal-leaf'),
      ],
      FULL_TIME,
    );

    expect(loadOf(load, 'okafor', MARCH_2026)).toStrictEqual({
      allocatedHours: 176,
      capacityHours: 176,
      isOversubscribed: false,
      causingAllocationId: undefined,
    });
  });

  it('treats exactly one person-month as within capacity, not over it', () => {
    const load = capacityLoad([allocation('a1', 'okafor', MARCH_2026, 176)], FULL_TIME);

    expect(loadOf(load, 'okafor', MARCH_2026).isOversubscribed).toBe(false);
  });

  it('flags one hour past capacity', () => {
    const load = capacityLoad([allocation('a1', 'okafor', MARCH_2026, 177)], FULL_TIME);

    expect(loadOf(load, 'okafor', MARCH_2026).isOversubscribed).toBe(true);
  });

  it('finds the overload the seed hides from a per-project check', () => {
    // Milan Brandt in the real fixtures: 0.59 person-months on Ledger
    // Consolidation and 0.59 on Client Portal Rebuild. Neither allocation is
    // anywhere near a full month, and the largest single allocation in the whole
    // seed file is 0.65, so a check inside one project finds nothing at all.
    const capacity = personMonthHours(40, JUNE_2026);
    const each = capacity * 0.59;

    const load = capacityLoad(
      [
        allocation('a1', 'okafor', JUNE_2026, each, 0, 'ledger-leaf'),
        allocation('a2', 'okafor', JUNE_2026, each, 0, 'portal-leaf'),
      ],
      FULL_TIME,
    );

    const june = loadOf(load, 'okafor', JUNE_2026);

    expect(each).toBeLessThan(capacity);
    expect(june.allocatedHours).toBeCloseTo(capacity * 1.18, 10);
    expect(june.isOversubscribed).toBe(true);
  });
});

describe('capacity depends on the contract and on the month', () => {
  it('gives the same hours a different verdict on a shorter contract', () => {
    const allocations = [allocation('a1', 'okafor', MARCH_2026, 100)];

    expect(
      capacityLoad(allocations, new Map([['okafor', 40]]))
        .get('okafor')
        ?.get('2026-03'),
    ).toMatchObject({ capacityHours: 176, isOversubscribed: false });
    expect(
      capacityLoad(allocations, new Map([['okafor', 20]]))
        .get('okafor')
        ?.get('2026-03'),
    ).toMatchObject({ capacityHours: 88, isOversubscribed: true });
  });

  it('keeps months independent of each other', () => {
    const load = capacityLoad(
      [allocation('a1', 'okafor', MARCH_2026, 200), allocation('a2', 'okafor', JUNE_2026, 10)],
      FULL_TIME,
    );

    expect(loadOf(load, 'okafor', MARCH_2026).isOversubscribed).toBe(true);
    expect(loadOf(load, 'okafor', JUNE_2026).isOversubscribed).toBe(false);
  });

  it('counts a month no grid horizon would show', () => {
    // February 2026 is before the fixtures' twelve-month window opens. The grid
    // leaves such a month out of its columns and its totals; capacity does not,
    // and there is no horizon argument here to say otherwise.
    const february = yearMonth(2026, 2);
    const load = capacityLoad([allocation('a1', 'okafor', february, 200)], FULL_TIME);

    expect(loadOf(load, 'okafor', february)).toMatchObject({
      capacityHours: 160,
      isOversubscribed: true,
    });
  });
});

describe('naming the assignment that caused it', () => {
  it('names the most recently edited contributor', () => {
    const load = capacityLoad(
      [
        allocation('a1', 'okafor', MARCH_2026, 90, 100),
        allocation('a2', 'okafor', MARCH_2026, 90, 300),
        allocation('a3', 'okafor', MARCH_2026, 90, 200),
      ],
      FULL_TIME,
    );

    expect(loadOf(load, 'okafor', MARCH_2026).causingAllocationId).toBe('a2');
  });

  it('breaks a tie on the lowest id so the answer does not move', () => {
    const load = capacityLoad(
      [
        allocation('a9', 'okafor', MARCH_2026, 90, 7),
        allocation('a3', 'okafor', MARCH_2026, 90, 7),
        allocation('a5', 'okafor', MARCH_2026, 90, 7),
      ],
      FULL_TIME,
    );

    expect(loadOf(load, 'okafor', MARCH_2026).causingAllocationId).toBe('a3');
  });

  it('gives the same answer whatever order the allocations arrive in', () => {
    const allocations = [
      allocation('a1', 'okafor', MARCH_2026, 90, 100),
      allocation('a2', 'okafor', MARCH_2026, 90, 300),
      allocation('a3', 'okafor', MARCH_2026, 90, 200),
    ];

    const forwards = capacityLoad(allocations, FULL_TIME);
    const backwards = capacityLoad([...allocations].reverse(), FULL_TIME);

    expect(loadOf(backwards, 'okafor', MARCH_2026).causingAllocationId).toBe(
      loadOf(forwards, 'okafor', MARCH_2026).causingAllocationId,
    );
  });

  it('names nobody when the month is within capacity', () => {
    const load = capacityLoad([allocation('a1', 'okafor', MARCH_2026, 10, 999)], FULL_TIME);

    expect(loadOf(load, 'okafor', MARCH_2026).causingAllocationId).toBeUndefined();
  });
});

describe('what it leaves out and what it refuses', () => {
  it('says nothing about a person-month with no allocation', () => {
    const load = capacityLoad([allocation('a1', 'okafor', MARCH_2026, 10)], FULL_TIME);

    expect(load.get('okafor')?.has('2026-06')).toBe(false);
    expect(load.has('brandt')).toBe(false);
  });

  it('refuses an employee with no contracted hours rather than assuming any', () => {
    expect(() => capacityLoad([allocation('a1', 'ghost', MARCH_2026, 10)], FULL_TIME)).toThrow(
      RangeError,
    );
  });

  it('refuses hours or an edit stamp that cannot exist', () => {
    expect(() => capacityLoad([allocation('a1', 'okafor', MARCH_2026, -1)], FULL_TIME)).toThrow(
      RangeError,
    );
    expect(() =>
      capacityLoad([allocation('a1', 'okafor', MARCH_2026, 10, Number.NaN)], FULL_TIME),
    ).toThrow(RangeError);
  });
});
