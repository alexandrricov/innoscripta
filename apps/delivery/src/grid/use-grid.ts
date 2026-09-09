/**
 * Everything the staffing grid renders.
 *
 * Three sources, and it matters which is which. The horizon, the tree and the
 * allocations are Delivery's own. The employees' names come from People's
 * published contract, because Delivery has no employee table and is not going
 * to grow one.
 *
 * If People cannot be reached the grid still builds: rows fall back to showing
 * the employee id, and the caller is told why. Hours are the one unit that
 * needs nothing from People, which is exactly why they are the canonical one.
 */

import { loadPeopleContract } from '@baseline/contracts';
import { type FlatRow, flattenRows, rollUpHours, type YearMonth } from '@baseline/domain';
import { useEffect, useState } from 'react';

import { onDeliveryChanged } from '../data/store-changes.ts';
import { deliveryStore } from '../data/store-instance.ts';

export interface GridData {
  readonly horizon: readonly YearMonth[];
  readonly rows: readonly FlatRow[];
  /** Employee id to display name. Falls back to the id when People is absent. */
  readonly employeeNames: ReadonlyMap<string, string>;
  /** Set when People could not be reached, so the caller can say so. */
  readonly namesUnavailable: string | null;
}

export type GridState =
  | { readonly status: 'loading' }
  | ({ readonly status: 'ready' } & GridData)
  | { readonly status: 'failed'; readonly message: string };

export function useGrid(projectId: string | undefined): GridState {
  const [state, setState] = useState<GridState>({ status: 'loading' });
  // Bumped by the store's own change notifications, the same ones the published
  // contract forwards to People. An edit anywhere in Delivery refreshes the
  // grid without a counter being threaded through the components.
  const [revision, setRevision] = useState(0);

  useEffect(
    () =>
      onDeliveryChanged(() => {
        setRevision((current) => current + 1);
      }),
    [],
  );

  useEffect(() => {
    let abandoned = false;

    build(projectId)
      .then((next) => {
        if (!abandoned) {
          setState(next);
        }
      })
      .catch((error: unknown) => {
        if (!abandoned) {
          setState({ status: 'failed', message: messageOf(error) });
        }
      });

    return () => {
      abandoned = true;
    };
  }, [projectId, revision]);

  return state;
}

async function build(projectId: string | undefined): Promise<GridState> {
  const store = await deliveryStore();
  const projects = await store.listProjects();
  const open = projectId ?? projects[0]?.id;

  const horizon = await store.gridHorizon();

  if (open === undefined) {
    return {
      status: 'ready',
      horizon,
      rows: [],
      employeeNames: new Map(),
      namesUnavailable: null,
    };
  }

  const [items, allocations] = await Promise.all([
    store.listBreakdown(open),
    store.listAllocations(open),
  ]);

  const rows = flattenRows(rollUpHours(items, allocations, horizon));
  const { employeeNames, namesUnavailable } = await namesFromPeople();

  return { status: 'ready', horizon, rows, employeeNames, namesUnavailable };
}

async function namesFromPeople(): Promise<{
  employeeNames: ReadonlyMap<string, string>;
  namesUnavailable: string | null;
}> {
  try {
    const contract = await loadPeopleContract();
    const employees = await contract.employees();

    return {
      employeeNames: new Map(employees.map((employee) => [employee.id, employee.name])),
      namesUnavailable: null,
    };
  } catch (error: unknown) {
    // A degraded grid, not a broken one: rows show ids and everything else
    // still works.
    return { employeeNames: new Map(), namesUnavailable: messageOf(error) };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
