import { useState } from 'react';

import type { StoredRate } from '../data/people-store.ts';
import { newRateId, validateRateDraft } from './rate-draft.ts';

interface AddRateFormProps {
  readonly employeeId: string;
  readonly history: readonly StoredRate[];
  readonly onSave: (rate: StoredRate) => Promise<string | null>;
}

const EMPTY = { validFrom: '', hourlyCost: '' };

export function AddRateForm({ employeeId, history, onSave }: AddRateFormProps) {
  const [fields, setFields] = useState(EMPTY);
  const [problems, setProblems] = useState<readonly string[]>([]);

  const submit = async (): Promise<void> => {
    const result = validateRateDraft({ id: newRateId(), ...fields }, employeeId, history);
    if (!result.ok) {
      setProblems(result.problems);
      return;
    }

    const failure = await onSave(result.rate);
    if (failure === null) {
      setFields(EMPTY);
      setProblems([]);
      return;
    }
    setProblems([failure]);
  };

  return (
    <form
      className="people-add-rate"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="people-rate-fields">
        <label className="bl-visually-hidden" htmlFor="new-rate-from">
          New rate valid from
        </label>
        <input
          id="new-rate-from"
          className="people-rate-date"
          type="date"
          value={fields.validFrom}
          onChange={(event) => {
            setFields({ ...fields, validFrom: event.target.value });
          }}
        />

        <label className="bl-visually-hidden" htmlFor="new-rate-cost">
          New hourly cost
        </label>
        <input
          id="new-rate-cost"
          className="people-rate-cost"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="0.00"
          value={fields.hourlyCost}
          onChange={(event) => {
            setFields({ ...fields, hourlyCost: event.target.value });
          }}
        />
        <span className="people-rate-unit">per hour</span>

        <button type="submit" className="people-rate-add">
          Add rate
        </button>
      </div>

      {problems.length > 0 && (
        <ul className="people-rate-problems" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
