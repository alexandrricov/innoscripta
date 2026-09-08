import { describe, expect, it } from 'vitest';

import { allocationCost, blendedHourlyRate, hoursFromCost } from './allocation-cost.ts';
import { parseCalendarDay, yearMonth } from './calendar.ts';
import { type RateSlice, splitMonthByRates } from './rate-schedule.ts';

const MARCH_2026 = yearMonth(2026, 3);

/** A. Okafor's March 2026, produced by the module under test's real input. */
const REFERENCE_SLICES = splitMonthByRates(
  [
    { validFrom: parseCalendarDay('2025-01-01'), hourlyCost: 80 },
    { validFrom: parseCalendarDay('2026-03-12'), hourlyCost: 95 },
  ],
  MARCH_2026,
);

/** 0.50 person-months for a 40 h/week contract in a 22 working-day month. */
const REFERENCE_HOURS = 88;

describe('the reference calculation', () => {
  it('splits into the 8 and 14 working days it is built on', () => {
    expect(REFERENCE_SLICES).toStrictEqual([
      { kind: 'priced', workingDays: 8, hourlyCost: 80 },
      { kind: 'priced', workingDays: 14, hourlyCost: 95 },
    ]);
  });

  it('costs exactly 7880, with no floating-point residue', () => {
    const cost = allocationCost(REFERENCE_HOURS, REFERENCE_SLICES, MARCH_2026);

    expect(cost).toBe(7880);
    expect(cost.toFixed(2)).toBe('7880.00');
  });

  it('implies a blended rate of 89.5455 per hour', () => {
    const blended = blendedHourlyRate(REFERENCE_SLICES, MARCH_2026);

    expect(blended).toBe(1970 / 22);
    expect(blended.toFixed(4)).toBe('89.5455');
  });

  it('converts the cost back to the hours it came from', () => {
    expect(hoursFromCost(7880, REFERENCE_SLICES, MARCH_2026)).toBe(REFERENCE_HOURS);
  });
});

describe('blendedHourlyRate', () => {
  it('weights the rates by working days rather than averaging them', () => {
    // The arithmetic mean of 80 and 95 is 87.50. The later rate covers 14 of the
    // 22 working days, so the blended rate sits above it.
    expect(blendedHourlyRate(REFERENCE_SLICES, MARCH_2026)).toBeGreaterThan(87.5);
    expect(blendedHourlyRate(REFERENCE_SLICES, MARCH_2026).toFixed(4)).toBe('89.5455');
  });

  it('equals the rate itself when the month has only one', () => {
    const slices: RateSlice[] = [{ kind: 'priced', workingDays: 22, hourlyCost: 80 }];

    expect(blendedHourlyRate(slices, MARCH_2026)).toBe(80);
  });

  it('does not depend on the size of the allocation', () => {
    const blended = blendedHourlyRate(REFERENCE_SLICES, MARCH_2026);

    for (const hours of [88, 44, 22, 11, 1]) {
      const cost = allocationCost(hours, REFERENCE_SLICES, MARCH_2026);

      expect(cost / hours).toBeCloseTo(blended, 10);
    }
  });

  it('is dragged down by working days that carry no rate', () => {
    const slices: RateSlice[] = [
      { kind: 'unpriced', workingDays: 8 },
      { kind: 'priced', workingDays: 14, hourlyCost: 95 },
    ];

    // 14 * 95 / 22, not 95: eight of the twenty-two days cost nothing.
    expect(blendedHourlyRate(slices, MARCH_2026).toFixed(4)).toBe('60.4545');
  });
});

describe('allocationCost and blendedHourlyRate agree', () => {
  it('gives the same cost either way round', () => {
    const blended = blendedHourlyRate(REFERENCE_SLICES, MARCH_2026);

    expect(REFERENCE_HOURS * blended).toBe(
      allocationCost(REFERENCE_HOURS, REFERENCE_SLICES, MARCH_2026),
    );
  });

  it('survives a round trip through currency', () => {
    for (const hours of [88, 44, 17.5, 1]) {
      const cost = allocationCost(hours, REFERENCE_SLICES, MARCH_2026);

      expect(hoursFromCost(cost, REFERENCE_SLICES, MARCH_2026)).toBeCloseTo(hours, 10);
    }
  });
});

describe('a month with nothing priced', () => {
  const slices: RateSlice[] = [{ kind: 'unpriced', workingDays: 22 }];

  it('costs nothing', () => {
    expect(allocationCost(REFERENCE_HOURS, slices, MARCH_2026)).toBe(0);
  });

  it('has a blended rate of zero', () => {
    expect(blendedHourlyRate(slices, MARCH_2026)).toBe(0);
  });

  it('refuses to turn a cost into hours', () => {
    expect(() => hoursFromCost(1000, slices, MARCH_2026)).toThrow(RangeError);
  });
});

describe('an empty allocation', () => {
  it('costs nothing but still has a blended rate', () => {
    expect(allocationCost(0, REFERENCE_SLICES, MARCH_2026)).toBe(0);
    expect(blendedHourlyRate(REFERENCE_SLICES, MARCH_2026).toFixed(4)).toBe('89.5455');
  });
});

describe('rejected input', () => {
  it('refuses hours or a cost that cannot exist', () => {
    expect(() => allocationCost(-1, REFERENCE_SLICES, MARCH_2026)).toThrow(RangeError);
    expect(() => allocationCost(Number.NaN, REFERENCE_SLICES, MARCH_2026)).toThrow(RangeError);
    expect(() => hoursFromCost(-1, REFERENCE_SLICES, MARCH_2026)).toThrow(RangeError);
  });

  it('refuses slices that do not account for the whole month', () => {
    const short: RateSlice[] = [{ kind: 'priced', workingDays: 10, hourlyCost: 80 }];

    expect(() => allocationCost(REFERENCE_HOURS, short, MARCH_2026)).toThrow(RangeError);
    expect(() => blendedHourlyRate(short, MARCH_2026)).toThrow(RangeError);
  });
});
