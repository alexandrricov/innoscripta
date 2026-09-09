/**
 * Everything the staffing grid renders.
 *
 * Three sources, and it matters which is which. The horizon, the tree and the
 * allocations are Delivery's own. Employee names and the pricing of a
 * person-month come from People's published contract, because Delivery has no
 * employee table and no rate record and is not going to grow either.
 *
 * If People cannot be reached the grid still builds. Rows fall back to the
 * employee id, and only hours are shown - hours are the one unit that needs
 * nothing from anybody, which is exactly why they are the stored one.
 */

import { loadPeopleContract, type MonthPricing, pricingKey } from '@baseline/contracts';
import {
  type Allocation,
  type AssignmentBasis,
  type BasisLookup,
  type BreakdownRow,
  type CapacityLoad,
  capacityLoad,
  type FlatRow,
  flattenRows,
  formatYearMonth,
  type GridUnit,
  rollUpHours,
  rollUpInUnit,
  type UnitRowValues,
  type YearMonth,
} from '@baseline/domain';
import { useEffect, useState } from 'react';

import { onDeliveryChanged } from '../data/store-changes.ts';
import { deliveryStore } from '../data/store-instance.ts';

export interface GridData {
  readonly horizon: readonly YearMonth[];
  readonly rows: readonly FlatRow[];
  readonly values: ReadonlyMap<BreakdownRow, UnitRowValues>;
  /** Employee id to display name. Falls back to the id when People is absent. */
  readonly employeeNames: ReadonlyMap<string, string>;
  /** Employee id, then `YYYY-MM`. Empty when capacity cannot be judged. */
  readonly capacity: ReadonlyMap<string, ReadonlyMap<string, CapacityLoad>>;
  /** Set when People could not be reached, so the caller can say so. */
  readonly peopleUnavailable: string | null;
}

export type GridState =
  | { readonly status: 'loading' }
  | ({ readonly status: 'ready' } & GridData)
  | { readonly status: 'failed'; readonly message: string };

export function useGrid(projectId: string | undefined, unit: GridUnit): GridState {
  const [state, setState] = useState<GridState>({ status: 'loading' });
  // Bumped by the store's own change notifications, the same ones the published
  // contract forwards to People, and by People's when a rate changes. An edit on
  // either side refreshes the grid with no reload and no counter threaded
  // through the components.
  const [revision, setRevision] = useState(0);

  const bump = (): void => {
    setRevision((current) => current + 1);
  };

  useEffect(() => onDeliveryChanged(bump), []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    loadPeopleContract()
      .then((contract) => {
        // This is what "a rate edited in People reaches any open Delivery cost
        // view with no reload" comes down to on this side.
        unsubscribe = contract.subscribe(bump);
      })
      .catch(() => {
        // Nothing to subscribe to. The grid degrades; it does not fail.
      });

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    let abandoned = false;

    build(projectId, unit)
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
  }, [projectId, unit, revision]);

  return state;
}

async function build(projectId: string | undefined, unit: GridUnit): Promise<GridState> {
  const store = await deliveryStore();
  const projects = await store.listProjects();
  const open = projectId ?? projects[0]?.id;
  const horizon = await store.gridHorizon();

  if (open === undefined) {
    return {
      status: 'ready',
      horizon,
      rows: [],
      values: new Map(),
      employeeNames: new Map(),
      capacity: new Map(),
      peopleUnavailable: null,
    };
  }

  const [items, allocations, everyAllocation] = await Promise.all([
    store.listBreakdown(open),
    store.listAllocations(open),
    // Capacity is cross-project, so this one is deliberately not filtered.
    store.listAllAllocations(),
  ]);

  const roots = rollUpHours(items, allocations, horizon);
  const rows = flattenRows(roots);

  const people = await fromPeople(everyAllocation, horizon);

  return {
    status: 'ready',
    horizon,
    rows,
    values: rollUpInUnit(roots, unit, people.basisOf, horizon),
    employeeNames: people.employeeNames,
    capacity: capacityLoad(everyAllocation, people.capacityHoursOf),
    peopleUnavailable: people.unavailable,
  };
}

interface FromPeople {
  readonly employeeNames: ReadonlyMap<string, string>;
  readonly basisOf: BasisLookup;
  readonly capacityHoursOf: (employeeId: string, month: YearMonth) => number | undefined;
  readonly unavailable: string | null;
}

async function fromPeople(
  everyAllocation: readonly Allocation[],
  horizon: readonly YearMonth[],
): Promise<FromPeople> {
  try {
    const contract = await loadPeopleContract();
    const employees = await contract.employees();

    // One call for every pair that can appear anywhere on screen, plus the ones
    // capacity needs outside the horizon. A call per cell would be thousands of
    // round trips for one grid.
    const snapshot = await contract.pricing(wantedPairs(everyAllocation, horizon));
    const pricingOf = (employeeId: string, month: YearMonth): MonthPricing | undefined =>
      snapshot.get(pricingKey(employeeId, formatYearMonth(month)));

    return {
      employeeNames: new Map(employees.map((employee) => [employee.id, employee.name])),
      basisOf: (employeeId, month): AssignmentBasis | undefined => {
        const pricing = pricingOf(employeeId, month);
        return pricing === undefined
          ? undefined
          : {
              basis: {
                personMonthHours: pricing.personMonthHours,
                blendedHourlyRate: pricing.blendedHourlyRate,
              },
              hasUnpricedDays: pricing.hasUnpricedDays,
            };
      },
      capacityHoursOf: (employeeId, month) => pricingOf(employeeId, month)?.personMonthHours,
      unavailable: null,
    };
  } catch (error: unknown) {
    // Degraded, not broken: ids instead of names, hours only, no capacity
    // verdicts. Every one of those needs something People owns.
    return {
      employeeNames: new Map(),
      basisOf: () => undefined,
      capacityHoursOf: () => undefined,
      unavailable: messageOf(error),
    };
  }
}

/**
 * Every pair worth asking about: the visible columns for everybody in the plan,
 * plus whatever months the allocations themselves touch.
 *
 * The second part matters. Capacity ignores the horizon, so a person committed
 * in a month the grid does not show still needs their person-month priced.
 */
function wantedPairs(
  everyAllocation: readonly Allocation[],
  horizon: readonly YearMonth[],
): { employeeId: string; month: string }[] {
  const pairs = new Map<string, { employeeId: string; month: string }>();

  const want = (employeeId: string, month: string): void => {
    pairs.set(pricingKey(employeeId, month), { employeeId, month });
  };

  for (const allocation of everyAllocation) {
    want(allocation.employeeId, formatYearMonth(allocation.month));
    for (const month of horizon) {
      want(allocation.employeeId, formatYearMonth(month));
    }
  }

  return [...pairs.values()];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
