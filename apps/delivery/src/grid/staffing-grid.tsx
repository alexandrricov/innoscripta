import { type DisplayCurrency, formatMoneyAmount, moneyToDisplay } from '@baseline/contracts';
import {
  type CapacityLoad,
  displayDecimals,
  distributeRounded,
  formatUnit,
  formatYearMonth,
  type GridUnit,
  type UnitRowValues,
} from '@baseline/domain';
import { useState } from 'react';

import { useHostSession } from '../session.tsx';
import { AddPersonRow } from './add-person-row.tsx';
import { GridCell } from './grid-cell.tsx';
import { renderList } from './render-list.ts';
import type { GridActions, GridData } from './use-grid.ts';

interface StaffingGridProps {
  readonly data: GridData;
  readonly actions: GridActions;
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
 * Money is converted into the display currency before that distribution, not
 * after. The guarantee is about the numbers on screen, and in a non-euro
 * currency those are the converted ones; rounding euros and converting the
 * rounded figures afterwards would leave the column not adding up in every
 * currency but the stored one.
 *
 * Only along the row. The column direction - a parent's month cell against the
 * sum of its children in that month - can still differ by one unit of the last
 * place, because no independent rounding satisfies both axes at once. Stated in
 * the README rather than hidden: proper two-dimensional controlled rounding is
 * a different algorithm.
 */
function displayed(
  values: UnitRowValues | undefined,
  unit: GridUnit,
  columns: number,
  currency: DisplayCurrency,
): { readonly cells: readonly (number | null)[]; readonly total: number | null } {
  const nothing = Array.from({ length: columns }, () => null);

  if (!values || values.byMonth.every((value) => value === null)) {
    return { cells: nothing, total: null };
  }

  const stored = values.byMonth.map((value) => value ?? 0);
  const months = unit === 'cost' ? stored.map((value) => moneyToDisplay(value, currency)) : stored;

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

export function StaffingGrid({ data, actions, unit }: StaffingGridProps) {
  const { horizon, rows, values, employeeNames, capacity, peopleUnavailable } = data;
  const { currency, user } = useHostSession();
  const [problem, setProblem] = useState<string | null>(null);

  /** A value already in the display currency, written out. */
  const show = (value: number): string =>
    unit === 'cost' ? formatMoneyAmount(value, currency) : formatUnit(value, unit);

  const loadOf = (employeeId: string, column: number): CapacityLoad | undefined => {
    const month = horizon[column];
    return month === undefined ? undefined : capacity.get(employeeId)?.get(formatYearMonth(month));
  };

  /** Why this cell cannot be typed into, or nothing when it can. */
  const readOnlyBecause = (employeeId: string, column: number): string | undefined => {
    if (unit === 'hours') {
      return undefined;
    }

    const month = horizon[column];
    const known = month === undefined ? undefined : data.basisOf(employeeId, month);

    if (!known) {
      return 'People is unavailable, so only hours can be edited';
    }
    if (unit === 'cost' && known.basis.blendedHourlyRate === 0) {
      return 'This month has no rate behind it, so a cost cannot be turned back into hours';
    }
    return undefined;
  };

  const everybody = [...employeeNames].map(([id, name]) => ({ id, name }));

  return (
    <>
      {/* One live region for the whole grid: a cell is too small to hold a
          sentence, and the reason should be announced once. */}
      <p className="delivery-grid-problem" role="alert">
        {problem}
      </p>

      <div className="delivery-grid-scroll">
        <table className="delivery-grid">
          <caption className="bl-visually-hidden">
            Planned effort by work package and month. Derived rows are summed from the rows beneath
            them and cannot be edited.
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
            {renderList(rows).map((entry) => {
              if (entry.kind === 'addPerson') {
                const alreadyOn = new Set(
                  rows
                    .map(({ row }) => row)
                    .filter(
                      (row) => row.kind === 'assignment' && row.breakdownItemId === entry.itemId,
                    )
                    .map((row) => (row.kind === 'assignment' ? row.employeeId : '')),
                );

                return (
                  <AddPersonRow
                    key={`add:${entry.itemId}`}
                    itemName={entry.itemName}
                    columns={horizon.length}
                    depth={entry.depth}
                    available={
                      peopleUnavailable === null
                        ? everybody.filter((employee) => !alreadyOn.has(employee.id))
                        : []
                    }
                    onAdd={(employeeId) => actions.addPerson(entry.itemId, employeeId)}
                  />
                );
              }

              const { row, depth } = entry;
              const derived = row.kind === 'item';
              const label = derived
                ? row.name
                : (employeeNames.get(row.employeeId) ?? row.employeeId);
              const key = derived
                ? `item:${row.id}`
                : `assignment:${row.breakdownItemId}:${row.employeeId}`;

              const own = values.get(row);
              const { cells, total } = displayed(own, unit, horizon.length, currency);
              const isActiveUser = row.kind === 'assignment' && row.employeeId === user?.employeeId;

              return (
                <tr key={key} className={derived ? 'delivery-grid-derived-row' : undefined}>
                  <th
                    scope="row"
                    className="delivery-grid-rowhead"
                    style={{ paddingLeft: `${String(0.5 + depth * 1.1)}rem` }}
                  >
                    {label}
                    {/* Whoever is signed in gets their own rows marked, so a
                        plan of 165 rows can be read for "what am I on". Text,
                        not colour: it has to survive a greyscale print and a
                        screen reader. */}
                    {isActiveUser && <span className="delivery-grid-you"> you</span>}
                    {derived && <span className="delivery-grid-derived-mark"> derived</span>}
                    {own?.hasUnpricedHours === true && (
                      <span
                        className="delivery-grid-unpriced"
                        title="Some hours below this row have no rate behind them"
                      >
                        {' '}
                        unpriced
                      </span>
                    )}
                  </th>

                  {cells.map((value, column) => {
                    const monthKey = formatYearMonth(
                      horizon[column] ?? { year: 0, month: column + 1 },
                    );

                    // Derived rows are read-only, and that is a fact about the
                    // type rather than a check: an item row has no employeeId,
                    // so there is nowhere for an edit to land.
                    if (row.kind !== 'assignment') {
                      return (
                        <td key={monthKey} className="delivery-grid-cell">
                          {value === null || value === 0 ? '' : show(value)}
                        </td>
                      );
                    }

                    return (
                      <GridCell
                        // Keyed by unit and currency as well as month, so
                        // switching either one closes an open editor instead of
                        // carrying the draft over. A "2767.57" typed as dollars
                        // of cost and committed after a switch to hours would be
                        // written as 2767.57 hours - the number keeps its digits
                        // and loses its meaning.
                        key={`${monthKey}:${unit}:${currency.code}`}
                        value={value}
                        unit={unit}
                        readOnlyBecause={readOnlyBecause(row.employeeId, column)}
                        load={loadOf(row.employeeId, column)}
                        onCommit={async (typed) => {
                          const failure = await actions.setCell(
                            row.breakdownItemId,
                            row.employeeId,
                            column,
                            typed,
                          );
                          setProblem(failure);
                          return failure;
                        }}
                      />
                    );
                  })}

                  <td className="delivery-grid-cell delivery-grid-total">
                    {total === null || total === 0 ? '' : show(total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
