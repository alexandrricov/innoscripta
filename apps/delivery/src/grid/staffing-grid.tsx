import {
  type CapacityLoad,
  displayDecimals,
  distributeRounded,
  formatUnit,
  formatYearMonth,
  type GridUnit,
  type UnitRowValues,
} from '@baseline/domain';

import type { GridData } from './use-grid.ts';

interface StaffingGridProps {
  readonly data: GridData;
  readonly unit: GridUnit;
}

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

/**
 * The cells and the total as they will be shown.
 *
 * Rule R3: the displayed total has to equal the sum of the displayed cells, so
 * the cells are the ones that get nudged. A row's total is exactly the sum of
 * its own months, so rounding the months with largest-remainder distribution
 * lands them on the rounded total by construction.
 *
 * Only along the row. The column direction - a parent's month cell against the
 * sum of its children in that month - can still differ by one unit of the last
 * place, because no independent rounding satisfies both axes at once. That is
 * stated in the README rather than hidden: proper two-dimensional controlled
 * rounding is a different algorithm.
 */
function displayed(
  values: UnitRowValues | undefined,
  unit: GridUnit,
  columns: number,
): { readonly cells: readonly (number | null)[]; readonly total: number | null } {
  const nothing = Array.from({ length: columns }, () => null);

  if (!values || values.byMonth.every((value) => value === null)) {
    return { cells: nothing, total: null };
  }

  const months = values.byMonth.map((value) => value ?? 0);

  // Cells and total are separate questions. % of capacity has cells and no
  // total - a percentage of one month cannot be added to a percentage of
  // another - and with nothing to reconcile against, each cell just rounds on
  // its own at display time.
  if (values.total === null) {
    return { cells: months, total: null };
  }

  const { parts, total } = distributeRounded(months, displayDecimals(unit));

  return { cells: parts, total };
}

export function StaffingGrid({ data, unit }: StaffingGridProps) {
  const { horizon, rows, values, employeeNames, capacity } = data;

  const loadOf = (employeeId: string, column: number): CapacityLoad | undefined => {
    const month = horizon[column];
    return month === undefined ? undefined : capacity.get(employeeId)?.get(formatYearMonth(month));
  };

  return (
    // A real table, not a grid of divs. The content is tabular and a screen
    // reader should be able to say which row and column a number sits in. The
    // wrapper scrolls because thirteen columns do not fit a narrow window.
    <div className="delivery-grid-scroll">
      <table className="delivery-grid">
        <caption className="bl-visually-hidden">
          Planned effort by work package and month. Derived rows are summed from the rows beneath
          them.
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

            const own = values.get(row);
            const { cells, total } = displayed(own, unit, horizon.length);

            return (
              <tr key={key} className={derived ? 'delivery-grid-derived-row' : undefined}>
                <th
                  scope="row"
                  className="delivery-grid-rowhead"
                  style={{ paddingLeft: `${String(0.5 + depth * 1.1)}rem` }}
                >
                  {label}
                  {derived && <span className="delivery-grid-derived-mark"> derived</span>}
                  {own?.hasUnpricedHours === true && (
                    <span
                      className="delivery-grid-unpriced"
                      title="Some hours have no rate behind them"
                    >
                      {' '}
                      unpriced
                    </span>
                  )}
                </th>

                {cells.map((value, column) => {
                  const load = derived ? undefined : loadOf(row.employeeId, column);
                  const over = load?.isOversubscribed === true;
                  const causing =
                    over && load.causingAllocationId !== undefined && row.kind === 'assignment';

                  return (
                    <td
                      key={formatYearMonth(horizon[column] ?? { year: 0, month: column + 1 })}
                      className={`delivery-grid-cell${over ? ' delivery-grid-over' : ''}`}
                    >
                      {value === null || value === 0 ? '' : formatUnit(value, unit)}
                      {over && value !== null && value !== 0 && (
                        <>
                          <span aria-hidden="true"> †</span>
                          <span className="bl-visually-hidden">
                            {' '}
                            over capacity: {load.allocatedHours.toFixed(2)} hours allocated across
                            every project against {load.capacityHours.toFixed(2)} of capacity
                            {causing ? ', flagged by the most recently edited assignment' : ''}
                          </span>
                        </>
                      )}
                    </td>
                  );
                })}

                <td className="delivery-grid-cell delivery-grid-total">
                  {total === null || total === 0 ? '' : formatUnit(total, unit)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
