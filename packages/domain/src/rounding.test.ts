import { describe, expect, it } from 'vitest';

import { distributeRounded } from './rounding.ts';

/**
 * Adds the parts the way the guarantee is defined: scaled to integers.
 *
 * Summing them as doubles is not the same question - 33.4 + 33.3 + 33.3 comes
 * out as 99.99999999999999.
 */
function sumScaled(parts: readonly number[], decimals: number): number {
  const scale = 10 ** decimals;
  return parts.reduce((sum, part) => sum + Math.round(part * scale), 0);
}

function toScaled(value: number, decimals: number): number {
  return Math.round(value * 10 ** decimals);
}

/** The four display precisions the specification fixes. */
const DISPLAY_PRECISIONS = [2, 1] as const;

describe('the case that motivates the whole thing', () => {
  it('makes three thirds add up to one', () => {
    const { parts, total } = distributeRounded([0.334, 0.333, 0.333], 2);

    expect(parts).toStrictEqual([0.34, 0.33, 0.33]);
    expect(total).toBe(1);
    expect(sumScaled(parts, 2)).toBe(toScaled(total, 2));
  });

  it('makes three thirds add up to a hundred percent at one decimal', () => {
    const { parts, total } = distributeRounded([33.333, 33.333, 33.333], 1);

    expect(parts).toStrictEqual([33.4, 33.3, 33.3]);
    expect(total).toBe(100);
    expect(sumScaled(parts, 1)).toBe(toScaled(total, 1));
  });

  it('leaves values that already round cleanly alone', () => {
    const { parts, total } = distributeRounded([0.25, 0.25, 0.5], 2);

    expect(parts).toStrictEqual([0.25, 0.25, 0.5]);
    expect(total).toBe(1);
  });
});

describe('ties', () => {
  it('gives the unit to the larger value', () => {
    // All three remainders are exactly half a unit, and two units are going
    // spare. Breaking the tie by position instead would renumber the row as
    // soon as it was sorted differently.
    const { parts, total } = distributeRounded([10.005, 20.115, 30.225], 2);

    expect(parts).toStrictEqual([10, 20.12, 30.23]);
    expect(total).toBe(60.35);
    expect(sumScaled(parts, 2)).toBe(toScaled(total, 2));
  });

  it('falls back to the earlier value only when the values are equal', () => {
    const { parts, total } = distributeRounded([0.125, 0.125], 2);

    expect(parts).toStrictEqual([0.13, 0.12]);
    expect(total).toBe(0.25);
  });

  it('resolves a three-way tie left to right', () => {
    // Three values of 0.005 sum to 0.015, which displays as 0.02 - two units
    // where the floors give none, so the first two values get one each.
    const { parts, total } = distributeRounded([0.005, 0.005, 0.005], 2);

    expect(total).toBe(0.02);
    expect(parts).toStrictEqual([0.01, 0.01, 0]);
    expect(sumScaled(parts, 2)).toBe(toScaled(total, 2));
  });
});

describe('degenerate inputs', () => {
  it('handles an empty breakdown', () => {
    expect(distributeRounded([], 2)).toStrictEqual({ parts: [], total: 0 });
  });

  it('handles a single value', () => {
    const { parts, total } = distributeRounded([7.777], 2);

    expect(parts).toStrictEqual([7.78]);
    expect(total).toBe(7.78);
  });

  it('handles zeros mixed in', () => {
    const { parts, total } = distributeRounded([0, 0.5, 0.5], 2);

    expect(parts).toStrictEqual([0, 0.5, 0.5]);
    expect(total).toBe(1);
  });

  it('handles all zeros', () => {
    const { parts, total } = distributeRounded([0, 0, 0], 2);

    expect(parts).toStrictEqual([0, 0, 0]);
    expect(total).toBe(0);
  });
});

describe('the guarantee', () => {
  const cases: readonly number[][] = [
    [0.334, 0.333, 0.333],
    [1 / 3, 1 / 3, 1 / 3],
    [0.005, 0.005, 0.005, 0.005],
    [10.005, 20.115, 30.225],
    [0.1, 0.2, 0.3, 0.4],
    [88, 44, 17.5, 140.8],
    [7880 / 3, 7880 / 3, 7880 / 3],
    [0.999, 0.999, 0.002],
    Array.from({ length: 60 }, (_unused, index) => (index + 1) / 13),
  ];

  it('always makes the parts add up to the total', () => {
    for (const decimals of DISPLAY_PRECISIONS) {
      for (const values of cases) {
        const { parts, total } = distributeRounded(values, decimals);

        expect(sumScaled(parts, decimals)).toBe(toScaled(total, decimals));
      }
    }
  });

  it('never moves a part more than one unit of the last place', () => {
    for (const decimals of DISPLAY_PRECISIONS) {
      for (const values of cases) {
        const { parts } = distributeRounded(values, decimals);

        parts.forEach((part, index) => {
          const naive = toScaled(values[index] ?? 0, decimals);

          expect(Math.abs(toScaled(part, decimals) - naive)).toBeLessThanOrEqual(1);
        });
      }
    }
  });

  it('does not depend on the order of the values', () => {
    for (const decimals of DISPLAY_PRECISIONS) {
      for (const values of cases) {
        const forwards = distributeRounded(values, decimals);
        const backwards = distributeRounded([...values].reverse(), decimals);

        expect(backwards.total).toBe(forwards.total);
        expect([...backwards.parts].sort((a, b) => a - b)).toStrictEqual(
          [...forwards.parts].sort((a, b) => a - b),
        );
      }
    }
  });

  it('holds for the strings the user actually sees', () => {
    for (const decimals of DISPLAY_PRECISIONS) {
      for (const values of cases) {
        const { parts, total } = distributeRounded(values, decimals);

        const shown = parts.map((part) => part.toFixed(decimals));
        const addedUp = shown.reduce((sum, text) => sum + toScaled(Number(text), decimals), 0);

        expect(addedUp).toBe(toScaled(Number(total.toFixed(decimals)), decimals));
      }
    }
  });
});

describe('rejected input', () => {
  it('refuses a precision that makes no sense', () => {
    expect(() => distributeRounded([1], -1)).toThrow(RangeError);
    expect(() => distributeRounded([1], 1.5)).toThrow(RangeError);
    expect(() => distributeRounded([1], 99)).toThrow(RangeError);
  });

  it('refuses a value that is not a number', () => {
    expect(() => distributeRounded([1, Number.NaN], 2)).toThrow(RangeError);
    expect(() => distributeRounded([1, Number.POSITIVE_INFINITY], 2)).toThrow(RangeError);
  });
});
