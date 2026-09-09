/**
 * Filtering the register.
 *
 * Sixty rows, so a plain substring match over the whole list on every keystroke
 * is the right amount of machinery. No debounce, no index, no virtual list -
 * deliberately, not by omission.
 */

import type { Employee } from '../data/people-store.ts';

export function matchEmployees(employees: readonly Employee[], query: string): readonly Employee[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) {
    return employees;
  }

  return employees.filter(
    (employee) =>
      employee.name.toLocaleLowerCase().includes(needle) ||
      employee.role.toLocaleLowerCase().includes(needle),
  );
}
