/**
 * The plan, backed by IndexedDB.
 *
 * Every rule that could go wrong - which moves are allowed, what a name must
 * be, what a deletion takes with it - comes from `../breakdown/tree.ts`, which
 * is pure and tested. This file is transactions.
 */

import {
  type Allocation,
  type BreakdownItem,
  formatYearMonth,
  monthsBetween,
  parseYearMonth,
} from '@baseline/domain';

import {
  descendantsOf,
  moveProblem,
  nameProblem,
  newAllocationId,
  newItemId,
} from '../breakdown/tree.ts';
import { type DeliveryDatabase, readGridHorizon } from './delivery-database.ts';
import type { ChildInsertion, DeliveryStore } from './delivery-store.ts';

export function createIndexedDbDeliveryStore(db: DeliveryDatabase): DeliveryStore {
  async function allocationsUnder(projectId: string): Promise<readonly Allocation[]> {
    const items = await db.getAllFromIndex('breakdownItems', 'by-project', projectId);
    const perItem = await Promise.all(
      items.map((item) => db.getAllFromIndex('allocations', 'by-item', item.id)),
    );

    return perItem.flat();
  }

  return {
    gridHorizon: async () => {
      const stored = await readGridHorizon(db);
      if (!stored) {
        throw new Error('The grid horizon is missing from the store');
      }
      return monthsBetween(parseYearMonth(stored.from), parseYearMonth(stored.to));
    },

    listProjects: () => db.getAll('projects'),

    listBreakdown: (projectId) => db.getAllFromIndex('breakdownItems', 'by-project', projectId),

    listAllocations: (projectId) => allocationsUnder(projectId),

    listAllAllocations: () => db.getAll('allocations'),

    addChild: async (projectId, parentId, name): Promise<ChildInsertion> => {
      const problem = nameProblem(name);
      if (problem !== null) {
        throw new Error(problem);
      }

      const tx = db.transaction(['breakdownItems', 'allocations'], 'readwrite');
      const items = tx.objectStore('breakdownItems');
      const allocations = tx.objectStore('allocations');

      if (parentId !== null) {
        const parent = await items.get(parentId);
        if (!parent) {
          throw new Error(`There is no work package "${parentId}"`);
        }
        if (parent.projectId !== projectId) {
          throw new Error(`Work package "${parentId}" belongs to another project`);
        }
      }

      const child: BreakdownItem = {
        id: newItemId(),
        projectId,
        parentId,
        name: name.trim(),
      };
      await items.put(child);

      // Rule R4: allocations sitting on the parent move onto the new child, in
      // this same transaction. The hours do not change and neither does whose
      // month they belong to, so `editedAt` is left alone - this is not an edit
      // to the plan, it is the same effort one level deeper.
      let movedAllocations = 0;
      if (parentId !== null) {
        const own = await allocations.index('by-item').getAll(parentId);
        await Promise.all(
          own.map((allocation) => allocations.put({ ...allocation, breakdownItemId: child.id })),
        );
        movedAllocations = own.length;
      }

      await tx.done;
      return { child, movedAllocations };
    },

    renameItem: async (itemId, name) => {
      const problem = nameProblem(name);
      if (problem !== null) {
        throw new Error(problem);
      }

      const tx = db.transaction('breakdownItems', 'readwrite');
      const items = tx.objectStore('breakdownItems');
      const item = await items.get(itemId);
      if (!item) {
        throw new Error(`There is no work package "${itemId}"`);
      }

      await items.put({ ...item, name: name.trim() });
      await tx.done;
    },

    moveItem: async (itemId, parentId) => {
      const tx = db.transaction('breakdownItems', 'readwrite');
      const items = tx.objectStore('breakdownItems');

      const item = await items.get(itemId);
      if (!item) {
        throw new Error(`There is no work package "${itemId}"`);
      }

      // Every item, not just this project's: "cannot move into a different
      // project" is not a rule you can check while only looking at one project.
      const problem = moveProblem(await items.getAll(), itemId, parentId);
      if (problem !== null) {
        throw new Error(problem);
      }

      await items.put({ ...item, parentId });
      await tx.done;
    },

    deleteItem: async (itemId) => {
      const tx = db.transaction(['breakdownItems', 'allocations'], 'readwrite');
      const items = tx.objectStore('breakdownItems');
      const allocations = tx.objectStore('allocations');

      const item = await items.get(itemId);
      if (!item) {
        // Nothing to do rather than an error: deleting twice is not a problem
        // worth surfacing.
        await tx.done;
        return;
      }

      const inProject = await items.index('by-project').getAll(item.projectId);
      const going = [itemId, ...descendantsOf(inProject, itemId).map((child) => child.id)];

      const allocationKeys = (
        await Promise.all(going.map((id) => allocations.index('by-item').getAllKeys(id)))
      ).flat();

      // One transaction, so the tree and the allocations under it cannot end up
      // half removed.
      await Promise.all([
        ...going.map((id) => items.delete(id)),
        ...allocationKeys.map((key) => allocations.delete(key)),
      ]);

      await tx.done;
    },

    setCellHours: async (breakdownItemId, employeeId, month, hours) => {
      assertHours(hours);

      const tx = db.transaction(['breakdownItems', 'allocations'], 'readwrite');
      const items = tx.objectStore('breakdownItems');
      const allocations = tx.objectStore('allocations');

      if ((await items.get(breakdownItemId)) === undefined) {
        throw new Error(`Cannot allocate to unknown work package "${breakdownItemId}"`);
      }

      const monthKey = formatYearMonth(month);
      const onItem = await allocations.index('by-item').getAll(breakdownItemId);
      const inCell = onItem.filter(
        (allocation) =>
          allocation.employeeId === employeeId && formatYearMonth(allocation.month) === monthKey,
      );

      // One record per cell. Anything else there is folded into it, with the
      // value the user just typed, so no reading of the cell is ambiguous.
      const [keep, ...duplicates] = inCell;

      await Promise.all([
        allocations.put({
          id: keep?.id ?? newAllocationId(),
          breakdownItemId,
          employeeId,
          month,
          hours,
          editedAt: Date.now(),
        }),
        ...duplicates.map((allocation) => allocations.delete(allocation.id)),
      ]);

      await tx.done;
    },

    saveAllocation: async (allocation) => {
      const tx = db.transaction(['breakdownItems', 'allocations'], 'readwrite');
      const item = await tx.objectStore('breakdownItems').get(allocation.breakdownItemId);
      if (!item) {
        throw new Error(`Cannot allocate to unknown work package "${allocation.breakdownItemId}"`);
      }

      await tx.objectStore('allocations').put(allocation);
      await tx.done;
    },

    removeAllocation: (allocationId) => db.delete('allocations', allocationId),
  };
}

function assertHours(hours: number): void {
  if (!Number.isFinite(hours) || hours < 0) {
    throw new Error(`A cell cannot hold ${String(hours)} hours`);
  }
}
