/**
 * What Delivery owns, and the only way to reach it.
 *
 * Asynchronous throughout, with the shape an HTTP client would have, for the
 * same reason as in People: this is the seam a real backend attaches at.
 *
 * Delivery owns the plan. It does not own people, and there is no employee
 * table in its database - names and contracted hours come from People's
 * published contract. The one exception is the import, which reads weekly hours
 * out of the shared seed file to turn person-months into hours and then forgets
 * them.
 */

import type { Allocation, BreakdownItem, YearMonth } from '@baseline/domain';

/** A project as Delivery knows it. Dates stay strings; nothing computes on them yet. */
export interface Project {
  readonly id: string;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
}

/** What happens to a leaf's own allocations when a child is put beneath it. */
export interface ChildInsertion {
  readonly child: BreakdownItem;
  /** How many allocations moved from the parent onto the new child. */
  readonly movedAllocations: number;
}

export interface DeliveryStore {
  /** The twelve months the grid opens on, from the fixture's own metadata. */
  gridHorizon(): Promise<readonly YearMonth[]>;

  listProjects(): Promise<readonly Project[]>;

  listBreakdown(projectId: string): Promise<readonly BreakdownItem[]>;
  listAllocations(projectId: string): Promise<readonly Allocation[]>;
  /**
   * Every allocation in every project, which is what cross-project capacity
   * needs. Deliberately not filtered by anything: a person is over capacity in
   * a month regardless of which project is open.
   */
  listAllAllocations(): Promise<readonly Allocation[]>;

  /**
   * Adds a child under `parentId`, or at the top of the project when null.
   *
   * When the parent already holds allocations of its own, they move onto the new
   * child in the same transaction. Rule R4 allows either that or refusing the
   * insertion, and forbids losing them quietly; moving keeps the user able to
   * carry on, since nothing in the interface would let them relocate the
   * allocations by hand first.
   */
  addChild(projectId: string, parentId: string | null, name: string): Promise<ChildInsertion>;

  renameItem(itemId: string, name: string): Promise<void>;
  /** Refuses a move into the item's own subtree, which would detach the branch. */
  moveItem(itemId: string, parentId: string | null): Promise<void>;
  /** Takes the whole subtree and every allocation in it. */
  deleteItem(itemId: string): Promise<void>;

  /**
   * Sets what one cell of the grid holds.
   *
   * The cell, not an allocation id, is what the user edits: this person, on
   * this piece of work, in this month. Addressing it that way removes an
   * ambiguity the data model allows - nothing stops two allocation records
   * describing the same triple, and then "which one did they mean" has no
   * answer. Setting a cell collapses whatever is there into one record with the
   * value the user asked for, in one transaction.
   *
   * Zero keeps the record rather than deleting it, so the row stays put while
   * somebody corrects a typo instead of vanishing under the cursor. A zero adds
   * nothing to any roll-up and an empty cell is not treated as unpriced.
   *
   * `editedAt` is stamped here, which is what lets rule R5 name the assignment
   * that pushed a person over capacity.
   */
  setCellHours(
    breakdownItemId: string,
    employeeId: string,
    month: YearMonth,
    hours: number,
  ): Promise<void>;

  saveAllocation(allocation: Allocation): Promise<void>;
  removeAllocation(allocationId: string): Promise<void>;
}
