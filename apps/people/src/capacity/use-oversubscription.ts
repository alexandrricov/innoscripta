/**
 * Who is committed beyond their contracted hours (rule R5).
 *
 * People owns the contracts, so it owns the answer. Delivery publishes the
 * hours it has allocated across every project and nothing more; the comparison
 * with capacity happens here, with the same `personMonthHours` the register
 * shows.
 *
 * The subscription is what makes the badge follow an edit in Delivery without a
 * reload.
 *
 * If Delivery cannot be reached, this reports nothing rather than failing. The
 * register keeps working and only the badge is missing, which is exactly the
 * degradation the exercise asks a remote to survive.
 */

import { loadDeliveryContract, pricingKey } from '@baseline/contracts';
import { parseYearMonth, personMonthHours } from '@baseline/domain';
import { useEffect, useState } from 'react';

import type { Employee } from '../data/people-store.ts';

export interface OverloadedMonth {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly allocatedHours: number;
  readonly capacityHours: number;
}

/** Employee id to the months where their allocation exceeds their capacity. */
export type Oversubscription = ReadonlyMap<string, readonly OverloadedMonth[]>;

export interface OversubscriptionState {
  readonly oversubscription: Oversubscription;
  /** Set when Delivery could not be reached; the badge is simply absent. */
  readonly unavailable: string | null;
}

const NOTHING: Oversubscription = new Map();

export function useOversubscription(employees: readonly Employee[]): OversubscriptionState {
  const [state, setState] = useState<OversubscriptionState>({
    oversubscription: NOTHING,
    unavailable: null,
  });

  useEffect(() => {
    if (employees.length === 0) {
      return;
    }

    let abandoned = false;
    let unsubscribe: (() => void) | undefined;

    const recompute = async (contract: Awaited<ReturnType<typeof loadDeliveryContract>>) => {
      const allocated = await contract.allocatedHours();
      if (abandoned) {
        return;
      }
      setState({ oversubscription: overloadsOf(employees, allocated), unavailable: null });
    };

    loadDeliveryContract()
      .then(async (contract) => {
        // Recompute on every change to the plan, which is what "with no reload"
        // means from this side of the boundary.
        unsubscribe = contract.subscribe(() => {
          void recompute(contract);
        });
        await recompute(contract);
      })
      .catch((error: unknown) => {
        if (!abandoned) {
          setState({
            oversubscription: NOTHING,
            unavailable: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      abandoned = true;
      unsubscribe?.();
    };
  }, [employees]);

  return state;
}

function overloadsOf(
  employees: readonly Employee[],
  allocated: ReadonlyMap<string, number>,
): Oversubscription {
  const overloads = new Map<string, OverloadedMonth[]>();

  for (const [key, allocatedHours] of allocated) {
    const separator = key.lastIndexOf('|');
    const employeeId = key.slice(0, separator);
    const month = key.slice(separator + 1);

    const employee = employees.find((candidate) => candidate.id === employeeId);
    if (!employee || pricingKey(employeeId, month) !== key) {
      continue;
    }

    const capacityHours = personMonthHours(employee.weeklyHours, parseYearMonth(month));
    // Strictly greater: exactly 100% is exactly one person-month, which is fine.
    if (allocatedHours <= capacityHours) {
      continue;
    }

    const months = overloads.get(employeeId) ?? [];
    months.push({ month, allocatedHours, capacityHours });
    overloads.set(employeeId, months);
  }

  for (const months of overloads.values()) {
    months.sort((a, b) => a.month.localeCompare(b.month));
  }

  return overloads;
}
