import { parseCalendarDay } from '@baseline/domain';
import { describe, expect, it } from 'vitest';

import type { StoredRate } from '../data/people-store.ts';
import { draftOf, isUnchanged, newRateId, validateRateDraft } from './rate-draft.ts';

function rate(id: string, validFrom: string, hourlyCost: number): StoredRate {
  return { id, employeeId: 'emp-001', validFrom: parseCalendarDay(validFrom), hourlyCost };
}

const HISTORY: readonly StoredRate[] = [
  rate('rate-001', '2025-01-01', 80),
  rate('rate-002', '2026-03-12', 95),
];

function problemsOf(
  validFrom: string,
  hourlyCost: string,
  id = 'rate-new',
  existing: readonly StoredRate[] = HISTORY,
): readonly string[] {
  const result = validateRateDraft({ id, validFrom, hourlyCost }, 'emp-001', existing);
  return result.ok ? [] : result.problems;
}

describe('a draft that is fine', () => {
  it('becomes a rate record', () => {
    const result = validateRateDraft(
      { id: 'rate-new', validFrom: '2026-06-01', hourlyCost: '105.5' },
      'emp-001',
      HISTORY,
    );

    expect(result).toStrictEqual({
      ok: true,
      rate: {
        id: 'rate-new',
        employeeId: 'emp-001',
        validFrom: { year: 2026, month: 6, day: 1 },
        hourlyCost: 105.5,
      },
    });
  });

  it('accepts a date in the past, which is what retroactive means', () => {
    expect(problemsOf('2019-04-01', '60')).toStrictEqual([]);
  });

  it('accepts a cost of zero', () => {
    expect(problemsOf('2026-06-01', '0')).toStrictEqual([]);
  });

  it('ignores surrounding whitespace', () => {
    expect(problemsOf('  2026-06-01  ', '  90  ')).toStrictEqual([]);
  });
});

describe('a draft that is not', () => {
  it('needs a date', () => {
    expect(problemsOf('', '90')).toStrictEqual(['A rate needs a date to start from']);
  });

  it('needs a date that exists', () => {
    expect(problemsOf('2026-02-30', '90')).toStrictEqual([
      '"2026-02-30" is not a date that exists',
    ]);
    expect(problemsOf('12/03/2026', '90')).toStrictEqual([
      '"12/03/2026" is not a date that exists',
    ]);
  });

  it('needs an hourly cost', () => {
    expect(problemsOf('2026-06-01', '')).toStrictEqual(['A rate needs an hourly cost']);
  });

  it('needs the cost to be a number', () => {
    expect(problemsOf('2026-06-01', 'ninety')).toStrictEqual(['"ninety" is not a number']);
  });

  it('refuses a negative cost', () => {
    expect(problemsOf('2026-06-01', '-5')).toStrictEqual(['An hourly cost cannot be negative']);
  });

  it('reports both fields at once rather than one at a time', () => {
    expect(problemsOf('', 'ninety')).toStrictEqual([
      'A rate needs a date to start from',
      '"ninety" is not a number',
    ]);
  });
});

describe('two rates starting on the same day', () => {
  it('is refused, because such a history means nothing to a reader', () => {
    expect(problemsOf('2026-03-12', '99')).toStrictEqual([
      'Another rate already starts on 2026-03-12',
    ]);
  });

  it('does not count the record being edited as its own clash', () => {
    expect(problemsOf('2026-03-12', '99', 'rate-002')).toStrictEqual([]);
  });

  it('is fine when the history is empty', () => {
    expect(problemsOf('2026-03-12', '99', 'rate-new', [])).toStrictEqual([]);
  });
});

describe('drafts and records', () => {
  it('round-trips a record through a draft', () => {
    const draft = draftOf(rate('rate-001', '2025-01-01', 80));

    expect(draft).toStrictEqual({ id: 'rate-001', validFrom: '2025-01-01', hourlyCost: '80' });

    const result = validateRateDraft(draft, 'emp-001', HISTORY);

    expect(result.ok && result.rate).toStrictEqual(rate('rate-001', '2025-01-01', 80));
  });

  it('knows when nothing was actually typed', () => {
    const original = rate('rate-001', '2025-01-01', 80);

    expect(isUnchanged(draftOf(original), original)).toBe(true);
    expect(isUnchanged({ ...draftOf(original), hourlyCost: '81' }, original)).toBe(false);
    expect(isUnchanged({ ...draftOf(original), validFrom: '2025-01-02' }, original)).toBe(false);
  });
});

describe('newRateId', () => {
  it('is recognisable as a rate and never repeats', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newRateId()));

    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id.startsWith('rate-')).toBe(true);
    }
  });
});
