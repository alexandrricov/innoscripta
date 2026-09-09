import { useCallback, useEffect, useState } from 'react';

import type { StoredRate } from '../data/people-store.ts';
import { peopleStore } from '../data/store-instance.ts';

export type RateHistoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly rates: readonly StoredRate[] }
  | { readonly status: 'failed'; readonly message: string };

export interface RateHistory {
  readonly state: RateHistoryState;
  /** Resolves with a message when the write failed, or null when it went in. */
  readonly save: (rate: StoredRate) => Promise<string | null>;
  readonly remove: (rateId: string) => Promise<string | null>;
}

export function useRateHistory(employeeId: string | undefined): RateHistory {
  const [state, setState] = useState<RateHistoryState>({ status: 'loading' });
  // Bumped after every write, which re-runs the load. The store is the single
  // source of truth, so nothing here patches a local copy and hopes it matches.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (employeeId === undefined) {
      return;
    }

    let abandoned = false;
    setState({ status: 'loading' });

    peopleStore()
      .then((store) => store.listRates(employeeId))
      .then((rates) => {
        if (!abandoned) {
          setState({ status: 'ready', rates });
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
  }, [employeeId, revision]);

  const save = useCallback(async (rate: StoredRate): Promise<string | null> => {
    try {
      const store = await peopleStore();
      await store.saveRate(rate);
      setRevision((current) => current + 1);
      return null;
    } catch (error: unknown) {
      return messageOf(error);
    }
  }, []);

  const remove = useCallback(async (rateId: string): Promise<string | null> => {
    try {
      const store = await peopleStore();
      await store.removeRate(rateId);
      setRevision((current) => current + 1);
      return null;
    } catch (error: unknown) {
      return messageOf(error);
    }
  }, []);

  return { state, save, remove };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
