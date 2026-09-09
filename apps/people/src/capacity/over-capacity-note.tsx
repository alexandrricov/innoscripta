import { formatYearMonth, parseYearMonth } from '@baseline/domain';

import type { OverloadedMonth } from './use-oversubscription.ts';

interface OverCapacityNoteProps {
  readonly months: readonly OverloadedMonth[];
  readonly unavailable: string | null;
}

export function OverCapacityNote({ months, unavailable }: OverCapacityNoteProps) {
  if (unavailable !== null) {
    return (
      <p className="people-notice people-capacity-unavailable">
        Capacity cannot be checked right now: Delivery is unavailable. {unavailable}
      </p>
    );
  }

  if (months.length === 0) {
    return null;
  }

  return (
    <div className="people-capacity" role="note">
      <h4 className="people-detail-subheading">Over capacity</h4>
      <p className="people-detail-hint">
        Summed across every project, including ones nobody has open. The edit is flagged, never
        blocked.
      </p>
      <ul className="people-capacity-list">
        {months.map((month) => (
          <li key={month.month}>
            <span className="people-capacity-month">
              {formatYearMonth(parseYearMonth(month.month))}
            </span>
            <span className="people-capacity-numbers">
              {month.allocatedHours.toFixed(2)} h of {month.capacityHours.toFixed(2)} h
            </span>
            <span className="people-capacity-percent">
              {((month.allocatedHours / month.capacityHours) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
