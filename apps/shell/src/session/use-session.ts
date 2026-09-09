/**
 * The two things the host owns: the display currency and the active user.
 *
 * They live here rather than in either remote because both remotes need them and
 * neither may decide them. The value is pushed down as a prop, so the flow is
 * one-directional: this hook is the only writer in the suite.
 *
 * The user list is where it gets interesting. "Signed in" is a person from the
 * register, and the register belongs to People - so the shell asks the People
 * contract, over the same runtime seam the remotes use on each other. There is
 * no auth here and none is scored; the picker stands in for a session that a
 * real deployment would get from an identity provider.
 *
 * When People cannot be reached, the picker has nothing to offer and says so.
 * Nobody signed in is a normal state, so the shell keeps working and the remotes
 * receive `user: null` - the same value they see standalone.
 */

import {
  type ActiveUser,
  type CurrencyCode,
  type EmployeeSummary,
  type HostSession,
  loadPeopleContract,
} from '@baseline/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { displayCurrency } from './currency-rates.ts';

export interface SessionState {
  readonly session: HostSession;
  /** Who can be picked as the active user; empty until People answers. */
  readonly people: readonly EmployeeSummary[];
  /** Set when the register could not be reached, so the picker can say why. */
  readonly peopleUnavailable: string | null;
  setCurrency: (code: CurrencyCode) => void;
  /** `undefined` signs everybody out. */
  setActiveUser: (employeeId: string | undefined) => void;
}

const NOBODY: readonly EmployeeSummary[] = [];

export function useSession(): SessionState {
  const [code, setCode] = useState<CurrencyCode>('EUR');
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [people, setPeople] = useState<readonly EmployeeSummary[]>(NOBODY);
  const [peopleUnavailable, setPeopleUnavailable] = useState<string | null>(null);

  useEffect(() => {
    let abandoned = false;
    let unsubscribe: (() => void) | undefined;

    const reload = async (contract: Awaited<ReturnType<typeof loadPeopleContract>>) => {
      const employees = await contract.employees();
      if (!abandoned) {
        setPeople(employees);
        setPeopleUnavailable(null);
      }
    };

    loadPeopleContract()
      .then(async (contract) => {
        // Somebody renamed in People should not stay misspelled in the header.
        unsubscribe = contract.subscribe(() => {
          void reload(contract);
        });
        await reload(contract);
      })
      .catch((error: unknown) => {
        if (!abandoned) {
          setPeople(NOBODY);
          setPeopleUnavailable(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      abandoned = true;
      unsubscribe?.();
    };
  }, []);

  /**
   * The active user is derived from the id, not stored as a name.
   *
   * Keeping the whole `ActiveUser` in state would let the header show a name the
   * register no longer holds; recomputing means a rename in People reaches the
   * shell through the subscription above, and a person deleted from the register
   * signs out on their own.
   */
  const user = useMemo<ActiveUser | null>(() => {
    const found = people.find((employee) => employee.id === userId);
    return found ? { employeeId: found.id, name: found.name } : null;
  }, [people, userId]);

  const session = useMemo<HostSession>(
    () => ({ currency: displayCurrency(code), user }),
    [code, user],
  );

  return {
    session,
    people,
    peopleUnavailable,
    setCurrency: setCode,
    setActiveUser: useCallback((employeeId: string | undefined) => {
      setUserId(employeeId);
    }, []),
  };
}
