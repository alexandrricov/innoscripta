import { type CapacityLoad, formatUnit, type GridUnit } from '@baseline/domain';
import { useState } from 'react';

interface GridCellProps {
  readonly value: number | null;
  readonly unit: GridUnit;
  /** Absent when the cell can be edited; a reason when it cannot. */
  readonly readOnlyBecause: string | undefined;
  readonly load: CapacityLoad | undefined;
  /** Resolves with a message when the write did not go through, else null. */
  readonly onCommit: (typed: string) => Promise<string | null>;
}

export function GridCell({ value, unit, readOnlyBecause, load, onCommit }: GridCellProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const shown = value === null || value === 0 ? '' : formatUnit(value, unit);
  const over = load?.isOversubscribed === true;

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

  const className = `delivery-grid-cell${over ? ' delivery-grid-over' : ''}`;

  if (readOnlyBecause !== undefined) {
    return (
      <td className={className} title={readOnlyBecause}>
        {shown}
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
            setDraft(shown);
          }}
        >
          {shown === '' ? <span className="bl-visually-hidden">empty, edit</span> : shown}
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
        aria-label={`Value in ${unit}`}
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
