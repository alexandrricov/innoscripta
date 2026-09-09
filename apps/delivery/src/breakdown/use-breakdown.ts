import type { Allocation, BreakdownItem } from '@baseline/domain';
import { useCallback, useEffect, useState } from 'react';

import type { DeliveryStore, Project } from '../data/delivery-store.ts';
import { deliveryStore } from '../data/store-instance.ts';

export type BreakdownState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly projects: readonly Project[];
      readonly items: readonly BreakdownItem[];
      readonly allocations: readonly Allocation[];
    }
  | { readonly status: 'failed'; readonly message: string };

export interface BreakdownActions {
  /** Each resolves with a message when it did not go through, else null. */
  readonly addChild: (parentId: string | null, name: string) => Promise<string | null>;
  readonly rename: (itemId: string, name: string) => Promise<string | null>;
  readonly move: (itemId: string, parentId: string | null) => Promise<string | null>;
  readonly remove: (itemId: string) => Promise<string | null>;
}

export function useBreakdown(projectId: string | undefined): BreakdownState & BreakdownActions {
  const [state, setState] = useState<BreakdownState>({ status: 'loading' });
  // Every write bumps this, which reloads from the store. Nothing patches a
  // local copy and hopes it matches what was written.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let abandoned = false;

    deliveryStore()
      .then(async (store) => {
        const projects = await store.listProjects();
        const open = projectId ?? projects[0]?.id;
        if (open === undefined) {
          return { status: 'ready', projects, items: [], allocations: [] } as const;
        }

        const [items, allocations] = await Promise.all([
          store.listBreakdown(open),
          store.listAllocations(open),
        ]);

        return { status: 'ready', projects, items, allocations } as const;
      })
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

  const run = useCallback(
    async (act: (store: DeliveryStore) => Promise<unknown>): Promise<string | null> => {
      try {
        await act(await deliveryStore());
        setRevision((current) => current + 1);
        return null;
      } catch (error: unknown) {
        return messageOf(error);
      }
    },
    [],
  );

  const addChild = useCallback(
    (parentId: string | null, name: string) =>
      run(async (store) => {
        const projects = await store.listProjects();
        const open = projectId ?? projects[0]?.id;
        if (open === undefined) {
          throw new Error('There is no project to add to');
        }
        return store.addChild(open, parentId, name);
      }),
    [projectId, run],
  );

  const rename = useCallback(
    (itemId: string, name: string) => run((store) => store.renameItem(itemId, name)),
    [run],
  );

  const move = useCallback(
    (itemId: string, parentId: string | null) => run((store) => store.moveItem(itemId, parentId)),
    [run],
  );

  const remove = useCallback((itemId: string) => run((store) => store.deleteItem(itemId)), [run]);

  return { ...state, addChild, rename, move, remove };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
