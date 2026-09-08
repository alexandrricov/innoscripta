/**
 * Making displayed numbers add up (domain rule R3).
 *
 * Totals are computed from exact values and rounded only for display, so the
 * rounded cells have to be nudged to add up to the rounded total rather than
 * the other way round. Rounding each cell on its own does not: three cells of
 * 0.334, 0.333 and 0.333 each show 0.33 and add to 0.99 under a total of 1.00.
 *
 * Largest-remainder distribution fixes that by flooring every cell and handing
 * the missing units of the last place to the cells that came closest to
 * rounding up. No cell ever ends up more than one unit of the last place away
 * from its own rounded value, and the total stays honest.
 */

export interface RoundedBreakdown {
  /** The cells as displayed. They add up to `total` at `decimals` precision. */
  readonly parts: readonly number[];
  /** The total as displayed: the exact sum, rounded. */
  readonly total: number;
}

/**
 * Representation noise is snapped off at this many decimals before flooring.
 *
 * Scaling by a power of ten is not exact in binary: an exact 33.0 can arrive as
 * 32.999999999999996, and flooring that gives 32. Display precision never goes
 * past a few decimals, so snapping at nine is far away from any real remainder.
 */
const SNAP_DECIMALS = 9;

const SNAP_SCALE = 10 ** SNAP_DECIMALS;

/** Display precisions in this domain run from 0 to 2; the cap is a sanity bound. */
const MAX_DECIMALS = 6;

/**
 * Rounds `values` to `decimals` so that they add up to the rounded sum exactly.
 *
 * Ties go to the larger value first, and only then to the earlier one, which
 * keeps the outcome independent of the order the values arrive in.
 *
 * Note that the returned `parts` add up to `total` at `decimals` precision, not
 * as an exact sum of doubles: 33.4 + 33.3 + 33.3 is 99.99999999999999, not 100.
 * The guarantee is about the numbers as displayed. Compare them scaled to
 * integers, never by summing them as they are.
 */
export function distributeRounded(values: readonly number[], decimals: number): RoundedBreakdown {
  assertDecimals(decimals);
  values.forEach(assertFinite);

  const scale = 10 ** decimals;

  if (values.length === 0) {
    return { parts: [], total: 0 };
  }

  const scaled = values.map((value) => snap(value * scale));
  const floors = scaled.map((value) => Math.floor(value));

  const exactSum = values.reduce((sum, value) => sum + value, 0);
  const targetScaled = Math.round(snap(exactSum * scale));
  const flooredSum = floors.reduce((sum, value) => sum + value, 0);
  const deficit = targetScaled - flooredSum;

  // Every remainder is below one, so the shortfall cannot exceed the number of
  // values, and flooring cannot overshoot the target. Outside that range
  // something is wrong with the input or with this function - and this is money,
  // so it should be loud rather than clamped.
  if (deficit < 0 || deficit > values.length) {
    throw new RangeError(
      `Cannot distribute ${String(deficit)} units of the last place across ${String(values.length)} values`,
    );
  }

  // Ties are common rather than exotic: any set of values ending in half a unit
  // of the last place ties across the board. Breaking them by position alone
  // would make the result depend on the order the values arrive in, so a row
  // would renumber itself when re-sorted. Breaking them by size first fixes
  // that, and giving the extra unit to the larger cell also keeps its relative
  // error smaller. Position is only the last resort, for values that are equal
  // anyway - and then it cannot be observed.
  const byRemainder = scaled
    .map((value, index) => ({ index, remainder: value - Math.floor(value), size: value }))
    .sort((a, b) => b.remainder - a.remainder || b.size - a.size || a.index - b.index);

  const roundedUp = new Set(byRemainder.slice(0, deficit).map((entry) => entry.index));

  return {
    parts: floors.map((floored, index) => (floored + (roundedUp.has(index) ? 1 : 0)) / scale),
    total: targetScaled / scale,
  };
}

function snap(value: number): number {
  return Math.round(value * SNAP_SCALE) / SNAP_SCALE;
}

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new RangeError(
      `Decimals must be an integer between 0 and ${String(MAX_DECIMALS)}, got ${String(decimals)}`,
    );
  }
}

function assertFinite(value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Every value must be a finite number, got ${String(value)}`);
  }
}
