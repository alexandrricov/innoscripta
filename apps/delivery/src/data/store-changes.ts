/**
 * Telling anybody who cares that the plan changed.
 *
 * The mirror of People's: People subscribes through Delivery's published
 * contract so its oversubscription badge follows an allocation edit without a
 * reload.
 *
 * The store is wrapped rather than each caller remembering to announce, so a
 * new write path cannot quietly stop notifying.
 */

import type { DeliveryStore } from './delivery-store.ts';

const listeners = new Set<() => void>();

export function onDeliveryChanged(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function announce(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error: unknown) {
      console.error('A subscriber to Delivery failed', error);
    }
  }
}

export function withChangeNotifications(store: DeliveryStore): DeliveryStore {
  return {
    ...store,

    addChild: async (projectId, parentId, name) => {
      const inserted = await store.addChild(projectId, parentId, name);
      announce();
      return inserted;
    },

    renameItem: async (itemId, name) => {
      await store.renameItem(itemId, name);
      announce();
    },

    moveItem: async (itemId, parentId) => {
      await store.moveItem(itemId, parentId);
      announce();
    },

    deleteItem: async (itemId) => {
      await store.deleteItem(itemId);
      announce();
    },

    saveAllocation: async (allocation) => {
      await store.saveAllocation(allocation);
      announce();
    },

    removeAllocation: async (allocationId) => {
      await store.removeAllocation(allocationId);
      announce();
    },
  };
}
