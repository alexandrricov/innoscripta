import { formatMoneyAmount } from '@baseline/contracts';
import { type CapacityLoad, formatUnit, type GridUnit } from '@baseline/domain';
import { useState } from 'react';

import { useHostSession } from '../session.tsx';

interface GridCellProps {
  readonly value: number | null;
  readonly unit: GridUnit;
  /** Absent when the cell can be edited; a reason when it cannot. */
  readonly readOnlyBecause: string | undefined;
  readonly load: CapacityLoad | undefined;
  /** True when this month holds hours that no rate covers (rule R1). */
  readonly unpriced: boolean;
  /** Resolves with a message when the write did not go through, else null. */
  readonly onCommit: (typed: string) => Promise<string | null>;
}

export function GridCell({
  value,
  unit,
  readOnlyBecause,
  load,
  unpriced,
  onCommit,
}: GridCellProps) {
  // Read here rather than passed down: two thousand cells would each carry the
  // same prop through the same two components to reach the same value.
  const { currency } = useHostSession();
  const [draft, setDraft] = useState<string | null>(null);

  // `value` already arrives in the display currency - the row was converted
  // before it was rounded - so this only writes it out. What the user types goes
  // back the other way in `useGrid`.
  //
  // Two strings, not one. `shown` carries the currency symbol; `typable` is the
  // digits that go into a `type="number"` input, which would reject "$8510.40"
  // and silently blank itself.
  // Zero is normally shown as nothing - an empty cell reads better than a grid
  // of "0.00". An unpriced cell is the exception: R1 says the allocation costs
  // zero and the cell is marked, and a blank cell would say "nobody is assigned
  // here" instead of "these hours have no rate".
  const typable = value === null || (value === 0 && !unpriced) ? '' : formatUnit(value, unit);
  const shown =
    typable !== '' && unit === 'cost' ? formatMoneyAmount(value ?? 0, currency) : typable;
  const over = load?.isOversubscribed === true;

  // A different mark from the over-capacity dagger, because it says something
  // else: this number is not wrong, it is missing a rate.
  const unpricedMark = unpriced && (
    <>
      <span aria-hidden="true"> *</span>
      <span className="bl-visually-hidden"> no rate covers these hours, so they cost nothing</span>
    </>
  );

  const flag = over && shown !== '' && (
    <>
      {/* Never colour alone: the dagger says it too, and so does the text. */}
      <span aria-hidden="true"> †</span>
      <span className="bl-visually-hidden">
        {' '}
        over capacity: {load.allocatedHours.toFixed(2)} hours allocated across every project against{' '}
        {load.capacityHours.toFixed(2)} of capacity
        {load.causingAllocationId === undefined
          ? ''
          : ', flagged by the most recently edited assignment'}
      </span>
    </>
  );

  const className = `delivery-grid-cell${over ? ' delivery-grid-over' : ''}${
    unpriced ? ' delivery-grid-unpriced-cell' : ''
  }`;

  if (readOnlyBecause !== undefined) {
    return (
      <td className={className} title={readOnlyBecause}>
        {shown}
        {unpricedMark}
        {flag}
      </td>
    );
  }

  if (draft === null) {
    return (
      <td className={className}>
        {/*
          A button rather than an always-live input. This grid is 165 rows by 12
          months, so two thousand mounted inputs would be a lot of DOM for
          nothing. Tab reaches it and Enter opens it.
        */}
        <button
          type="button"
          className="delivery-grid-edit"
          onClick={() => {
            setDraft(typable);
          }}
        >
          {shown === '' ? <span className="bl-visually-hidden">empty, edit</span> : shown}
          {unpricedMark}
          {flag}
        </button>
      </td>
    );
  }

  const commit = async (): Promise<void> => {
    const failure = await onCommit(draft);
    if (failure === null) {
      setDraft(null);
    }
  };

  return (
    <td className={`${className} delivery-grid-editing`}>
      {/* Outlined while mid-edit, as the specification's own figure shows. */}
      <input
        className="delivery-grid-input"
        // Focus goes into the cell that was just activated. Not a surprise to
        // anybody: it is where the caret was asked for.
        autoFocus
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        aria-label={unit === 'cost' ? `Value in ${currency.code}` : `Value in ${unit}`}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            void commit();
          }
          if (event.key === 'Escape') {
            // Abandoned, not saved. Nothing was written on the way in either.
            setDraft(null);
          }
        }}
      />
    </td>
  );
}
