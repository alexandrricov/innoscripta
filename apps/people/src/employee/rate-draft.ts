/**
 * Turning what someone typed into a rate record, or into reasons why not.
 *
 * No React here, so it is tested as an ordinary function. The editor component
 * is left with holding a draft and showing whatever comes back.
 */

import { compareCalendarDay, formatCalendarDay, parseCalendarDay } from '@baseline/domain';

import type { StoredRate } from '../data/people-store.ts';

/** The two fields as they exist in the inputs: strings, possibly nonsense. */
export interface RateDraft {
  /** The record being edited, or a fresh id for a new one. */
  readonly id: string;
  /** `YYYY-MM-DD`, the value an `<input type="date">` produces. */
  readonly validFrom: string;
  readonly hourlyCost: string;
}

export type RateDraftResult =
  | { readonly ok: true; readonly rate: StoredRate }
  | { readonly ok: false; readonly problems: readonly string[] };

export function newRateId(): string {
  // Seeded records are `rate-001` and keep those ids; new ones stay recognisable
  // as rates without pretending to continue the sequence.
  return `rate-${crypto.randomUUID()}`;
}

/** The draft that matches an existing record, ready to be edited. */
export function draftOf(rate: StoredRate): RateDraft {
  return {
    id: rate.id,
    validFrom: formatCalendarDay(rate.validFrom),
    hourlyCost: String(rate.hourlyCost),
  };
}

export function isUnchanged(draft: RateDraft, rate: StoredRate): boolean {
  const original = draftOf(rate);
  return draft.validFrom === original.validFrom && draft.hourlyCost === original.hourlyCost;
}

/**
 * Every problem at once rather than the first one, so someone with two mistakes
 * is not made to fix them one submission at a time.
 *
 * `existing` is the employee's current history. It is only used to reject a
 * second record starting on the same day: the domain would cope, since sorting
 * makes the later one win, but a history with two rates "from 12 March" does not
 * mean anything to the person reading it.
 */
export function validateRateDraft(
  draft: RateDraft,
  employeeId: string,
  existing: readonly StoredRate[],
): RateDraftResult {
  const problems: string[] = [];

  const validFrom = readValidFrom(draft.validFrom, problems);
  const hourlyCost = readHourlyCost(draft.hourlyCost, problems);

  if (validFrom !== undefined) {
    const clash = existing.find(
      (rate) => rate.id !== draft.id && compareCalendarDay(rate.validFrom, validFrom) === 0,
    );
    if (clash) {
      problems.push(`Another rate already starts on ${formatCalendarDay(validFrom)}`);
    }
  }

  if (validFrom === undefined || hourlyCost === undefined || problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, rate: { id: draft.id, employeeId, validFrom, hourlyCost } };
}

function readValidFrom(
  value: string,
  problems: string[],
): ReturnType<typeof parseCalendarDay> | undefined {
  if (value.trim().length === 0) {
    problems.push('A rate needs a date to start from');
    return undefined;
  }

  try {
    // A date in the past is fine and is the point: history is correctable
    // retroactively.
    return parseCalendarDay(value.trim());
  } catch {
    problems.push(`"${value}" is not a date that exists`);
    return undefined;
  }
}

function readHourlyCost(value: string, problems: string[]): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    problems.push('A rate needs an hourly cost');
    return undefined;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    problems.push(`"${value}" is not a number`);
    return undefined;
  }
  if (parsed < 0) {
    problems.push('An hourly cost cannot be negative');
    return undefined;
  }

  return parsed;
}
