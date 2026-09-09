/**
 * Turning the seed fixture into what Delivery stores.
 *
 * Delivery takes projects, breakdown items and allocations. The other two
 * sections belong to People.
 *
 * The one interesting part is the unit. The fixture carries allocations in
 * person-months and the canonical unit here is hours, so each amount has to be
 * multiplied by the size of that person's person-month in that month - which
 * depends on their contracted weekly hours, and those belong to People.
 *
 * They are read out of the shared fixture, used for exactly this multiplication,
 * and not stored. Delivery ends up with hours and no employee table. The
 * ownership boundary is about what an app keeps and serves, not about what the
 * bootstrap file contains.
 */

import {
  type Allocation,
  type BreakdownItem,
  parseYearMonth,
  personMonthHours,
} from '@baseline/domain';
import { parseSeed, type SeedFile } from '@baseline/seed';

import type { Project } from './delivery-store.ts';

export interface DeliverySlice {
  readonly projects: readonly Project[];
  readonly items: readonly BreakdownItem[];
  readonly allocations: readonly Allocation[];
  /** The twelve months the grid opens on, from the fixture's own metadata. */
  readonly gridHorizon: { readonly from: string; readonly to: string };
}

/**
 * Nothing imported has been edited by anybody, and `editedAt` only has to grow.
 * Zero says that plainly, and any later edit stamped with a clock beats it.
 */
const SEEDED_AT = 0;

/**
 * Resolved against the bundle rather than the document: hosted inside the
 * shell, a bare path would ask the shell's origin for a file only this remote
 * serves. The bundler emits the fixture as an asset and rewrites this.
 */
const SEED_URL = new URL('../../../../fixtures/baseline-seed.json', import.meta.url).href;

export async function fetchDeliverySlice(url: string = SEED_URL): Promise<DeliverySlice> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Could not fetch the seed fixture from "${url}": ${String(response.status)} ${response.statusText}`,
    );
  }

  return deliverySliceOf(parseSeed(await response.json()));
}

export function deliverySliceOf(seed: SeedFile): DeliverySlice {
  const weeklyHoursByEmployee = new Map(
    seed.employees.map((employee) => [employee.id, employee.weeklyHours]),
  );

  const projects = seed.projects.map((project): Project => ({
    id: project.id,
    name: project.name,
    startDate: project.startDate,
    endDate: project.endDate,
  }));

  const items = seed.breakdownItems.map((item): BreakdownItem => ({
    id: item.id,
    projectId: item.projectId,
    parentId: item.parentId,
    name: item.name,
  }));

  const allocations = seed.allocations.map((allocation): Allocation => {
    const weeklyHours = weeklyHoursByEmployee.get(allocation.employeeId);
    if (weeklyHours === undefined) {
      throw new Error(
        `Allocation "${allocation.id}" belongs to unknown employee "${allocation.employeeId}", so its person-months cannot be converted to hours`,
      );
    }

    const month = parseYearMonth(allocation.month);

    return {
      id: allocation.id,
      breakdownItemId: allocation.breakdownItemId,
      employeeId: allocation.employeeId,
      month,
      hours: allocation.amount * personMonthHours(weeklyHours, month),
      editedAt: SEEDED_AT,
    };
  });

  return { projects, items, allocations, gridHorizon: seed.meta.gridHorizon };
}
