import { formatCalendarDay } from '@baseline/domain';
import { useState } from 'react';

import type { StoredRate } from '../data/people-store.ts';
import { draftOf, isUnchanged, type RateDraft, validateRateDraft } from './rate-draft.ts';

interface RateRowProps {
  readonly rate: StoredRate;
  readonly history: readonly StoredRate[];
  readonly onSave: (rate: StoredRate) => Promise<string | null>;
  readonly onRemove: (rateId: string) => Promise<string | null>;
}

export function RateRow({ rate, history, onSave, onRemove }: RateRowProps) {
  // The stored record is the truth, and the draft has to follow it after a write.
  // That reset comes from the key this row is rendered with, not from an effect
  // syncing a prop into state - see `rateRowKey`.
  const [draft, setDraft] = useState<RateDraft>(() => draftOf(rate));
  const [problems, setProblems] = useState<readonly string[]>([]);

  /**
   * Committed on blur and on Enter, never on each keystroke. Someone clearing
   * a date to retype it passes through an empty field on the way, and that is
   * not an edit worth rejecting or worth saving.
   */
  const commit = async (): Promise<void> => {
    if (isUnchanged(draft, rate)) {
      setProblems([]);
      return;
    }

    const result = validateRateDraft(draft, rate.employeeId, history);
    if (!result.ok) {
      setProblems(result.problems);
      return;
    }

    const failure = await onSave(result.rate);
    setProblems(failure === null ? [] : [failure]);
  };

  const rowId = `rate-${rate.id}`;

  return (
    <li className="people-rate-row">
      <div className="people-rate-fields">
        <label className="bl-visually-hidden" htmlFor={`${rowId}-from`}>
          Rate valid from
        </label>
        <input
          id={`${rowId}-from`}
          className="people-rate-date"
          type="date"
          value={draft.validFrom}
          aria-invalid={problems.length > 0}
          onChange={(event) => {
            setDraft({ ...draft, validFrom: event.target.value });
          }}
          onBlur={() => {
            void commit();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void commit();
            }
          }}
        />

        <label className="bl-visually-hidden" htmlFor={`${rowId}-cost`}>
          Hourly cost
        </label>
        <input
          id={`${rowId}-cost`}
          className="people-rate-cost"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={draft.hourlyCost}
          aria-invalid={problems.length > 0}
          onChange={(event) => {
            setDraft({ ...draft, hourlyCost: event.target.value });
          }}
          onBlur={() => {
            void commit();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void commit();
            }
          }}
        />
        <span className="people-rate-unit">per hour</span>

        <button
          type="button"
          className="people-rate-remove"
          onClick={() => {
            void onRemove(rate.id);
          }}
        >
          Remove
        </button>
      </div>

      {problems.length > 0 && (
        <ul className="people-rate-problems" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The key a row is rendered with: its id plus its stored values.
 *
 * Changing it remounts the row, which is how the draft gets reset when a write
 * lands. Identical stored values produce an identical key, so a reload that
 * changed nothing does not disturb anything being typed. Focus is safe because
 * a commit only happens on blur or Enter, by which time focus has moved.
 */
export function rateRowKey(rate: StoredRate): string {
  return `${rate.id}:${formatCalendarDay(rate.validFrom)}:${String(rate.hourlyCost)}`;
}
