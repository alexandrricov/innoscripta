import { formatYearMonth, personMonthHours, yearMonth } from '@baseline/domain';

import type { Employee } from '../data/people-store.ts';
import { AddRateForm } from './add-rate-form.tsx';
import { RateRow, rateRowKey } from './rate-row.tsx';
import { useRateHistory } from './use-rate-history.ts';

interface EmployeeDetailProps {
  readonly employee: Employee;
}

/** The month the browser is in, in UTC, like every other date in this suite. */
function currentMonth() {
  const now = new Date();
  return yearMonth(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

export function EmployeeDetail({ employee }: EmployeeDetailProps) {
  const { state, save, remove } = useRateHistory(employee.id);
  const month = currentMonth();

  return (
    <article className="people-detail" aria-labelledby="people-detail-heading">
      <h3 id="people-detail-heading" className="people-detail-name">
        {employee.name}
      </h3>

      <dl className="people-detail-facts">
        <dt>Role</dt>
        <dd>{employee.role}</dd>

        <dt>Contract</dt>
        <dd>{employee.weeklyHours} h/week</dd>

        <dt>One person-month in {formatYearMonth(month)}</dt>
        {/*
          Free to show and worth showing: it makes visible that a person-month is
          not a fixed number of hours but weeklyHours x workingDays / 5.
        */}
        <dd>{personMonthHours(employee.weeklyHours, month).toFixed(2)} h</dd>
      </dl>

      <h4 className="people-detail-subheading">Cost-rate history</h4>
      <p className="people-detail-hint">
        A rate applies from its date until the next one begins. Dates in the past are allowed;
        correcting history is the point.
      </p>

      {state.status === 'loading' && (
        <p className="people-notice" aria-busy="true">
          Loading the history...
        </p>
      )}

      {state.status === 'failed' && (
        <p className="people-notice people-notice-failed" role="alert">
          The history could not be loaded. {state.message}
        </p>
      )}

      {state.status === 'ready' && (
        <>
          {state.rates.length === 0 ? (
            <p className="people-notice">
              No rates yet, so this employee costs nothing and their cells are marked as unpriced.
            </p>
          ) : (
            <ul className="people-rate-list">
              {state.rates.map((rate) => (
                <RateRow
                  key={rateRowKey(rate)}
                  rate={rate}
                  history={state.rates}
                  onSave={save}
                  onRemove={remove}
                />
              ))}
            </ul>
          )}

          <AddRateForm employeeId={employee.id} history={state.rates} onSave={save} />
        </>
      )}
    </article>
  );
}
