/**
 * Turning the seed fixture into what People stores.
 *
 * People takes two of the file's six sections and ignores the rest. The other
 * four are Delivery's, and nothing here looks at them.
 */

import { compareCalendarDay, parseCalendarDay } from '@baseline/domain';
import { parseSeed, type SeedFile } from '@baseline/seed';

import type { Employee, StoredRate } from './people-store.ts';

export interface PeopleSlice {
  readonly employees: readonly Employee[];
  /** Oldest first, so the register can render a history without sorting again. */
  readonly rates: readonly StoredRate[];
}

/**
 * Where the fixture is served from.
 *
 * Referenced through `new URL(..., import.meta.url)` so the bundler emits the
 * file as an asset and rewrites this to its real address at runtime. That
 * matters more than it looks: a bare `'baseline-seed.json'` resolves against
 * whatever document is showing, so hosted inside the shell it asked the shell's
 * origin for a file only People serves, and got a 404. This resolves against
 * the bundle instead, which is the remote's own origin either way it runs.
 *
 * It also keeps the 147 kB out of every chunk - the asset is emitted beside the
 * bundle and fetched once.
 */
const SEED_URL = new URL('../../../../fixtures/baseline-seed.json', import.meta.url).href;

export async function fetchPeopleSlice(url: string = SEED_URL): Promise<PeopleSlice> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Could not fetch the seed fixture from "${url}": ${String(response.status)} ${response.statusText}`,
    );
  }

  return peopleSliceOf(parseSeed(await response.json()));
}

export function peopleSliceOf(seed: SeedFile): PeopleSlice {
  const employees = seed.employees.map((employee): Employee => ({
    id: employee.id,
    name: employee.name,
    role: employee.role,
    weeklyHours: employee.weeklyHours,
  }));

  // `parseCalendarDay` rejects a date that does not exist, so a bad validFrom
  // fails here rather than becoming a wrong rate split months later.
  const rates = seed.rateRecords
    .map((record): StoredRate => ({
      id: record.id,
      employeeId: record.employeeId,
      validFrom: parseCalendarDay(record.validFrom),
      hourlyCost: record.hourlyCost,
    }))
    .sort((a, b) => compareCalendarDay(a.validFrom, b.validFrom));

  return { employees, rates };
}
