import { useState } from 'react';

interface AddPersonRowProps {
  readonly itemName: string;
  readonly columns: number;
  readonly depth: number;
  /** Employees not already on this work package, id to name. */
  readonly available: readonly { readonly id: string; readonly name: string }[];
  readonly onAdd: (employeeId: string) => Promise<string | null>;
}

/**
 * Staffing a work package with somebody new.
 *
 * Without this the grid can only change numbers that already exist, so a work
 * package created in the tree could never be staffed - and the spec calls the
 * thing a grid of people by months.
 *
 * Adding somebody writes a zero into the first month, which is what makes their
 * row appear. That follows from zero keeping its record rather than deleting
 * it.
 */
export function AddPersonRow({ itemName, columns, depth, available, onAdd }: AddPersonRowProps) {
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <tr className="delivery-grid-add-row">
      {/* The same sticky row header as every other row: this control belongs to
          the work package above it, so it has to stay next to its name while the
          months scroll. */}
      <th
        scope="row"
        className="delivery-grid-rowhead"
        style={{ paddingLeft: `${String(0.5 + (depth + 1) * 1.1)}rem` }}
      >
        <label className="bl-visually-hidden" htmlFor={`add-person-${itemName}`}>
          Add somebody to {itemName}
        </label>
        <select
          id={`add-person-${itemName}`}
          className="delivery-grid-add-person"
          value=""
          disabled={available.length === 0}
          onChange={(event) => {
            const employeeId = event.target.value;
            if (employeeId === '') {
              return;
            }
            void onAdd(employeeId).then(setProblem);
          }}
        >
          <option value="">
            {available.length === 0 ? 'Nobody left to add' : 'Add somebody...'}
          </option>
          {available.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
        {problem !== null && (
          <span className="delivery-grid-cell-problem" role="alert">
            {problem}
          </span>
        )}
      </th>
      <td colSpan={columns + 1} />
    </tr>
  );
}
