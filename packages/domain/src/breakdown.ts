/**
 * Rolling effort up the work breakdown (domain rule R4).
 *
 * Effort on a parent comes from its children and is read-only. The editable
 * row is not a leaf of the breakdown tree but one level below it: a person
 * assigned to that piece of work. The spec's own word for that pairing is an
 * assignment, so that is what it is called here.
 *
 *     root item        derived
 *       mid item       derived
 *         leaf item    derived
 *           Okafor     editable
 *           Brandt     editable
 *
 * Only hours are rolled up here. Cost cannot be derived from a parent's hours,
 * because an hour costs what the person costs, and % of capacity does not
 * aggregate at all - half of one person plus half of another is not half of
 * anybody. Those belong to their own step.
 */

import { formatYearMonth, type YearMonth } from './calendar.ts';

/** One node of a project's work breakdown. `parentId` is null at the root. */
export interface BreakdownItem {
  readonly id: string;
  readonly projectId: string;
  readonly parentId: string | null;
  readonly name: string;
}

/**
 * One person's planned effort on one piece of work in one month.
 *
 * `hours` is the canonical unit. The seed file carries person-months and is
 * converted once, on import.
 *
 * `editedAt` orders edits. Rule R5 asks Delivery to name the most recently
 * edited allocation contributing to an over-capacity person-month, and the seed
 * has nothing to order by, so the store stamps it: a monotonic counter or epoch
 * milliseconds, either works as long as it only grows.
 */
export interface Allocation {
  readonly id: string;
  readonly breakdownItemId: string;
  readonly employeeId: string;
  readonly month: YearMonth;
  readonly hours: number;
  readonly editedAt: number;
}

interface RowTotals {
  /** Aligned to the horizon passed in, one entry per column. */
  readonly hoursByMonth: readonly number[];
  /** The sum of `hoursByMonth`, which is what the TOTAL column shows. */
  readonly totalHours: number;
}

/** A derived row. Its numbers come from below it and cannot be edited. */
export interface ItemRow extends RowTotals {
  readonly kind: 'item';
  readonly id: string;
  readonly name: string;
  readonly children: readonly BreakdownRow[];
}

/** An editable row: this person, on this piece of work. */
export interface AssignmentRow extends RowTotals {
  readonly kind: 'assignment';
  readonly breakdownItemId: string;
  readonly employeeId: string;
}

/**
 * A union rather than an `isEditable` flag, so that "parents are read-only" is
 * a fact about the type. An `ItemRow` has no `employeeId`, so there is nowhere
 * for an edit to land and no way to wire one up by mistake.
 */
export type BreakdownRow = ItemRow | AssignmentRow;

/**
 * Builds the grid's rows for `horizon` and fills in every derived total.
 *
 * Allocations outside the horizon are left out of both the columns and the
 * TOTAL. Rule R3 requires the displayed total to equal the sum of the displayed
 * cells, so a month that has no column must not reach the total either. Such an
 * allocation still counts towards capacity, which is a separate question and
 * not bounded by this horizon.
 *
 * Child items come before assignments, and both keep the order they arrived in;
 * sorting is the data layer's business, not the domain's.
 */
export function rollUpHours(
  items: readonly BreakdownItem[],
  allocations: readonly Allocation[],
  horizon: readonly YearMonth[],
): readonly ItemRow[] {
  const itemsById = indexItems(items);
  const childIdsByParent = groupChildren(items, itemsById);
  const assignedHours = indexAllocations(allocations, itemsById, horizon);

  const rootIds = items.filter((item) => item.parentId === null).map((item) => item.id);
  const reached = new Set<string>();

  const roots = rootIds.map((id) =>
    buildItemRow(id, itemsById, childIdsByParent, assignedHours, horizon.length, reached),
  );

  // Every item must hang off some root. One that does not is in a parentId
  // cycle, and a cycle would otherwise be invisible: the rows would render and
  // the numbers would just be missing effort.
  if (reached.size !== items.length) {
    throw new RangeError(
      `${String(items.length - reached.size)} breakdown items are unreachable from any root, which means parentId forms a cycle`,
    );
  }

  return roots;
}

function buildItemRow(
  id: string,
  itemsById: ReadonlyMap<string, BreakdownItem>,
  childIdsByParent: ReadonlyMap<string, readonly string[]>,
  assignedHours: ReadonlyMap<string, ReadonlyMap<string, readonly number[]>>,
  months: number,
  reached: Set<string>,
): ItemRow {
  const item = itemsById.get(id);
  if (!item) {
    throw new RangeError(`Unknown breakdown item "${id}"`);
  }
  reached.add(id);

  const childItems = (childIdsByParent.get(id) ?? []).map((childId) =>
    buildItemRow(childId, itemsById, childIdsByParent, assignedHours, months, reached),
  );

  const assignments: AssignmentRow[] = [...(assignedHours.get(id) ?? [])].map(
    ([employeeId, hoursByMonth]) => ({
      kind: 'assignment',
      breakdownItemId: id,
      employeeId,
      hoursByMonth,
      totalHours: sum(hoursByMonth),
    }),
  );

  // Own assignments plus children. An item is not supposed to carry both, but
  // the data model allows it, and adding is always safe: no effort can go
  // missing whatever shape the data takes.
  const hoursByMonth = new Array<number>(months).fill(0);
  for (const row of [...childItems, ...assignments]) {
    addInto(hoursByMonth, row.hoursByMonth);
  }

  return {
    kind: 'item',
    id,
    name: item.name,
    children: [...childItems, ...assignments],
    hoursByMonth,
    totalHours: sum(hoursByMonth),
  };
}

function indexItems(items: readonly BreakdownItem[]): ReadonlyMap<string, BreakdownItem> {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  if (itemsById.size !== items.length) {
    throw new RangeError('Breakdown items contain a duplicate id');
  }
  return itemsById;
}

function groupChildren(
  items: readonly BreakdownItem[],
  itemsById: ReadonlyMap<string, BreakdownItem>,
): ReadonlyMap<string, readonly string[]> {
  const childIdsByParent = new Map<string, string[]>();

  for (const item of items) {
    const { parentId } = item;
    if (parentId === null) {
      continue;
    }
    if (!itemsById.has(parentId)) {
      throw new RangeError(`Breakdown item "${item.id}" has an unknown parentId "${parentId}"`);
    }

    const siblings = childIdsByParent.get(parentId);
    if (siblings) {
      siblings.push(item.id);
    } else {
      childIdsByParent.set(parentId, [item.id]);
    }
  }

  return childIdsByParent;
}

function indexAllocations(
  allocations: readonly Allocation[],
  itemsById: ReadonlyMap<string, BreakdownItem>,
  horizon: readonly YearMonth[],
): ReadonlyMap<string, ReadonlyMap<string, readonly number[]>> {
  const columnByMonth = new Map(horizon.map((month, index) => [formatYearMonth(month), index]));
  const byItem = new Map<string, Map<string, number[]>>();

  for (const allocation of allocations) {
    if (!itemsById.has(allocation.breakdownItemId)) {
      throw new RangeError(
        `Allocation "${allocation.id}" points at unknown breakdown item "${allocation.breakdownItemId}"`,
      );
    }
    if (!Number.isFinite(allocation.hours) || allocation.hours < 0) {
      throw new RangeError(
        `Allocation "${allocation.id}" has ${String(allocation.hours)} hours, which is not a non-negative number`,
      );
    }

    const column = columnByMonth.get(formatYearMonth(allocation.month));
    if (column === undefined) {
      continue;
    }

    const byEmployee = byItem.get(allocation.breakdownItemId) ?? new Map<string, number[]>();
    byItem.set(allocation.breakdownItemId, byEmployee);

    const hoursByMonth =
      byEmployee.get(allocation.employeeId) ?? new Array<number>(horizon.length).fill(0);
    byEmployee.set(allocation.employeeId, hoursByMonth);

    hoursByMonth[column] = (hoursByMonth[column] ?? 0) + allocation.hours;
  }

  return byItem;
}

function addInto(target: number[], source: readonly number[]): void {
  source.forEach((value, index) => {
    target[index] = (target[index] ?? 0) + value;
  });
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
