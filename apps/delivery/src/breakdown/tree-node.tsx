import type { Allocation, BreakdownItem } from '@baseline/domain';
import { useState } from 'react';

import { childrenOf, deletionImpact, pathOf, validMoveTargets } from './tree.ts';
import type { BreakdownActions } from './use-breakdown.ts';

interface TreeNodeProps {
  readonly item: BreakdownItem;
  readonly items: readonly BreakdownItem[];
  readonly allocations: readonly Allocation[];
  readonly actions: BreakdownActions;
  readonly depth: number;
}

type RowMode = 'idle' | 'renaming' | 'adding' | 'confirmingDelete';

export function TreeNode({ item, items, allocations, actions, depth }: TreeNodeProps) {
  const [mode, setMode] = useState<RowMode>('idle');
  const [draftName, setDraftName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const children = childrenOf(items, item.id);
  const impact = deletionImpact(items, allocations, item.id);
  const ownAllocations = allocations.filter(
    (allocation) => allocation.breakdownItemId === item.id,
  ).length;

  const start = (next: RowMode, name: string): void => {
    setMode(next);
    setDraftName(name);
    setProblem(null);
  };

  const finish = (failure: string | null): void => {
    setProblem(failure);
    if (failure === null) {
      setMode('idle');
      setDraftName('');
    }
  };

  return (
    <li className="delivery-node">
      <div className="delivery-node-row" style={{ paddingLeft: `${String(depth * 1.25)}rem` }}>
        <span className="delivery-node-name">{item.name}</span>

        {children.length > 0 ? (
          <span className="delivery-node-derived">derived</span>
        ) : (
          ownAllocations > 0 && (
            <span className="delivery-node-count">
              {ownAllocations} {ownAllocations === 1 ? 'allocation' : 'allocations'}
            </span>
          )
        )}

        <span className="delivery-node-actions">
          <button
            type="button"
            onClick={() => {
              start('adding', '');
            }}
          >
            Add child
          </button>
          <button
            type="button"
            onClick={() => {
              start('renaming', item.name);
            }}
          >
            Rename
          </button>

          <label className="bl-visually-hidden" htmlFor={`move-${item.id}`}>
            Move {item.name} into
          </label>
          {/*
            A select rather than drag and drop. No tree or dnd library is
            allowed here, and a hand-rolled drag would be a lot of code that
            keyboard users could not operate. The options are the only legal
            destinations, so an illegal move cannot be expressed.
          */}
          <select
            id={`move-${item.id}`}
            className="delivery-node-move"
            value={item.parentId ?? ''}
            onChange={(event) => {
              const target = event.target.value;
              void actions.move(item.id, target === '' ? null : target).then((failure) => {
                setProblem(failure);
              });
            }}
          >
            <option value="">Top level</option>
            {/*
              Labelled by path, not by name: the fixture has two
              "Implementation" packages in one project, and bare names would
              leave the reader guessing which one they picked.
            */}
            {validMoveTargets(items, item.id).map((target) => (
              <option key={target.id} value={target.id}>
                {pathOf(items, target.id)}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="delivery-node-delete"
            onClick={() => {
              start('confirmingDelete', '');
            }}
          >
            Delete
          </button>
        </span>
      </div>

      {mode === 'confirmingDelete' && (
        <div className="delivery-node-confirm" role="alert">
          {/*
            Deleting a branch is a reasonable thing to want. Taking the effort
            and money under it without saying so is the silent loss R4 calls a
            failure, so the counts are shown before anything happens.
          */}
          <span>
            Delete &ldquo;{item.name}&rdquo;? {impact.items}{' '}
            {impact.items === 1 ? 'work package' : 'work packages'} and {impact.allocations}{' '}
            {impact.allocations === 1 ? 'allocation' : 'allocations'} will go.
          </span>
          <button
            type="button"
            className="delivery-node-delete"
            onClick={() => {
              void actions.remove(item.id).then(finish);
            }}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('idle');
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {(mode === 'renaming' || mode === 'adding') && (
        <form
          className="delivery-node-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (mode === 'renaming') {
              void actions.rename(item.id, draftName).then(finish);
            } else {
              void actions.addChild(item.id, draftName).then(finish);
            }
          }}
        >
          <label className="bl-visually-hidden" htmlFor={`name-${item.id}`}>
            {mode === 'renaming' ? 'New name' : 'Name of the new work package'}
          </label>
          <input
            id={`name-${item.id}`}
            className="delivery-node-input"
            value={draftName}
            placeholder={mode === 'renaming' ? item.name : 'New work package'}
            onChange={(event) => {
              setDraftName(event.target.value);
            }}
          />
          <button type="submit">{mode === 'renaming' ? 'Rename' : 'Add'}</button>
          <button
            type="button"
            onClick={() => {
              setMode('idle');
            }}
          >
            Cancel
          </button>
          {mode === 'adding' && ownAllocations > 0 && (
            <span className="delivery-node-hint">
              This package holds {ownAllocations}{' '}
              {ownAllocations === 1 ? 'allocation' : 'allocations'}; they will move onto the new
              child.
            </span>
          )}
        </form>
      )}

      {problem !== null && (
        <p className="delivery-node-problem" role="alert">
          {problem}
        </p>
      )}

      {children.length > 0 && (
        <ul className="delivery-node-children">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              items={items}
              allocations={allocations}
              actions={actions}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
