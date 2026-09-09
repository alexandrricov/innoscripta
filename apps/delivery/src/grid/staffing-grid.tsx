import { formatUnit, formatYearMonth } from '@baseline/domain';

import type { GridData } from './use-grid.ts';

interface StaffingGridProps {
  readonly data: GridData;
}

/** `2026-04` reads as `Apr 26` in a column heading. */
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function monthLabel(month: { year: number; month: number }): string {
  return `${MONTH_LABELS[month.month - 1] ?? String(month.month)} ${String(month.year % 100)}`;
}

export function StaffingGrid({ data }: StaffingGridProps) {
  const { horizon, rows, employeeNames } = data;

  return (
    // A real table, not a grid of divs. The content is tabular, and a screen
    // reader should be able to say which column and which row a number is in.
    // The wrapper scrolls because thirteen columns do not fit a narrow window.
    <div className="delivery-grid-scroll">
      <table className="delivery-grid">
        <caption className="bl-visually-hidden">
          Planned effort in hours, by work package and month
        </caption>
        <thead>
          <tr>
            <th scope="col" className="delivery-grid-rowhead">
              Work package / person
            </th>
            {horizon.map((month) => (
              <th key={formatYearMonth(month)} scope="col" className="delivery-grid-month">
                {monthLabel(month)}
              </th>
            ))}
            <th scope="col" className="delivery-grid-total">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, depth }) => {
            const derived = row.kind === 'item';
            const label = derived
              ? row.name
              : (employeeNames.get(row.employeeId) ?? row.employeeId);
            const key = derived
              ? `item:${row.id}`
              : `assignment:${row.breakdownItemId}:${row.employeeId}`;

            return (
              <tr key={key} className={derived ? 'delivery-grid-derived-row' : undefined}>
                <th
                  scope="row"
                  className="delivery-grid-rowhead"
                  style={{ paddingLeft: `${String(0.5 + depth * 1.1)}rem` }}
                >
                  {label}
                  {derived && <span className="delivery-grid-derived-mark"> derived</span>}
                </th>

                {row.hoursByMonth.map((hours, column) => (
                  <td
                    key={formatYearMonth(horizon[column] ?? { year: 0, month: column + 1 })}
                    className="delivery-grid-cell"
                  >
                    {/* An empty cell reads better blank than as 0.00 */}
                    {hours === 0 ? '' : formatUnit(hours, 'hours')}
                  </td>
                ))}

                <td className="delivery-grid-cell delivery-grid-total">
                  {row.totalHours === 0 ? '' : formatUnit(row.totalHours, 'hours')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
