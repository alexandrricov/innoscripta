import { useEffect, useState } from 'react';

import type { Employee } from '../data/people-store.ts';
import { peopleStore } from '../data/store-instance.ts';

/**
 * Three states, not a boolean and a nullable list.
 *
 * With `isLoading` plus `employees` plus `error` there are eight combinations
 * and only three of them mean anything. A union leaves exactly the three.
 */
export type RegisterState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly employees: readonly Employee[] }
  | { readonly status: 'failed'; readonly message: string };

export function useEmployees(): RegisterState {
  const [state, setState] = useState<RegisterState>({ status: 'loading' });

  useEffect(() => {
    let abandoned = false;

    peopleStore()
      .then((store) => store.listEmployees())
      .then((employees) => {
        if (!abandoned) {
          setState({ status: 'ready', employees });
        }
      })
      .catch((error: unknown) => {
        if (!abandoned) {
          setState({
            status: 'failed',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

    // The shell can unmount this panel while the fetch is in flight, and under
    // StrictMode the effect runs twice in development.
    return () => {
      abandoned = true;
    };
  }, []);

  return state;
}
