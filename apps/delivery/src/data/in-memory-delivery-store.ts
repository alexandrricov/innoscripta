/**
 * The plan held in memory.
 *
 * For tests, and the same rules as the IndexedDB one because both call the same
 * pure functions for them.
 */

import {
  type Allocation,
  type BreakdownItem,
  monthsBetween,
  parseYearMonth,
} from '@baseline/domain';

import { descendantsOf, moveProblem, nameProblem, newItemId } from '../breakdown/tree.ts';
import type { ChildInsertion, DeliveryStore } from './delivery-store.ts';
import type { DeliverySlice } from './seed-slice.ts';

export function createInMemoryDeliveryStore(slice: DeliverySlice): DeliveryStore {
  const projects = [...slice.projects];
  const items = new Map(slice.items.map((item) => [item.id, item]));
  const allocations = new Map(slice.allocations.map((allocation) => [allocation.id, allocation]));

  const itemsOfProject = (projectId: string): readonly BreakdownItem[] =>
    [...items.values()].filter((item) => item.projectId === projectId);

  return {
    gridHorizon: () =>
      Promise.resolve(
        monthsBetween(parseYearMonth(slice.gridHorizon.from), parseYearMonth(slice.gridHorizon.to)),
      ),

    listProjects: () => Promise.resolve(projects),

    listBreakdown: (projectId) => Promise.resolve(itemsOfProject(projectId)),

    listAllocations: (projectId) => {
      const inProject = new Set(itemsOfProject(projectId).map((item) => item.id));

      return Promise.resolve(
        [...allocations.values()].filter((allocation) => inProject.has(allocation.breakdownItemId)),
      );
    },

    listAllAllocations: () => Promise.resolve([...allocations.values()]),

    addChild: (projectId, parentId, name): Promise<ChildInsertion> => {
      const problem = nameProblem(name);
      if (problem !== null) {
        return Promise.reject(new Error(problem));
      }

      if (parentId !== null) {
        const parent = items.get(parentId);
        if (!parent) {
          return Promise.reject(new Error(`There is no work package "${parentId}"`));
        }
        if (parent.projectId !== projectId) {
          return Promise.reject(new Error(`Work package "${parentId}" belongs to another project`));
        }
      }

      const child: BreakdownItem = { id: newItemId(), projectId, parentId, name: name.trim() };
      items.set(child.id, child);

      // Rule R4: the parent's own allocations move onto the new child rather
      // than disappearing. Hours and month are untouched, so `editedAt` stays.
      let movedAllocations = 0;
      if (parentId !== null) {
        for (const allocation of [...allocations.values()]) {
          if (allocation.breakdownItemId === parentId) {
            allocations.set(allocation.id, { ...allocation, breakdownItemId: child.id });
            movedAllocations += 1;
          }
        }
      }

      return Promise.resolve({ child, movedAllocations });
    },

    renameItem: (itemId, name) => {
      const problem = nameProblem(name);
      if (problem !== null) {
        return Promise.reject(new Error(problem));
      }

      const item = items.get(itemId);
      if (!item) {
        return Promise.reject(new Error(`There is no work package "${itemId}"`));
      }

      items.set(itemId, { ...item, name: name.trim() });
      return Promise.resolve();
    },

    moveItem: (itemId, parentId) => {
      const item = items.get(itemId);
      if (!item) {
        return Promise.reject(new Error(`There is no work package "${itemId}"`));
      }

      // Every item, not just this project's: "cannot move into a different
      // project" is not a rule you can check while only looking at one project.
      const problem = moveProblem([...items.values()], itemId, parentId);
      if (problem !== null) {
        return Promise.reject(new Error(problem));
      }

      items.set(itemId, { ...item, parentId });
      return Promise.resolve();
    },

    deleteItem: (itemId) => {
      const item = items.get(itemId);
      if (!item) {
        return Promise.resolve();
      }

      const going = new Set([
        itemId,
        ...descendantsOf(itemsOfProject(item.projectId), itemId).map((child) => child.id),
      ]);

      for (const id of going) {
        items.delete(id);
      }
      for (const allocation of [...allocations.values()]) {
        if (going.has(allocation.breakdownItemId)) {
          allocations.delete(allocation.id);
        }
      }

      return Promise.resolve();
    },

    saveAllocation: (allocation: Allocation) => {
      if (!items.has(allocation.breakdownItemId)) {
        return Promise.reject(
          new Error(`Cannot allocate to unknown work package "${allocation.breakdownItemId}"`),
        );
      }

      allocations.set(allocation.id, allocation);
      return Promise.resolve();
    },

    removeAllocation: (allocationId) => {
      allocations.delete(allocationId);
      return Promise.resolve();
    },
  };
}
