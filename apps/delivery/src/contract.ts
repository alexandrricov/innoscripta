/**
 * What Delivery publishes to the rest of the suite.
 *
 * Hours allocated per person per month, summed across every project. That is
 * all, and the omission is the point: Delivery does not publish a verdict on
 * whether somebody is over capacity, because capacity is
 * `weeklyHours * workingDays / 5` and those hours belong to People.
 *
 * So People takes these numbers, compares them with a capacity it computes from
 * its own data, and reaches its own conclusion. Neither side needs the other to
 * answer its own question, and the dependency between them stays acyclic.
 *
 * Not bounded by the grid's twelve-month horizon either. A person is committed
 * in a month whatever happens to be on screen, and rule R5 says the sum is
 * across every project including ones nobody has open.
 */

import {
  type AllocatedHoursSnapshot,
  CONTRACT_VERSION,
  type DeliveryContract,
  pricingKey,
} from '@baseline/contracts';
import { formatYearMonth } from '@baseline/domain';

import { onDeliveryChanged } from './data/store-changes.ts';
import { deliveryStore } from './data/store-instance.ts';

export const contract: DeliveryContract = {
  version: CONTRACT_VERSION,

  allocatedHours: async (): Promise<AllocatedHoursSnapshot> => {
    const store = await deliveryStore();
    const allocations = await store.listAllAllocations();

    const total = new Map<string, number>();
    for (const allocation of allocations) {
      const key = pricingKey(allocation.employeeId, formatYearMonth(allocation.month));
      total.set(key, (total.get(key) ?? 0) + allocation.hours);
    }

    return total;
  },

  subscribe: onDeliveryChanged,
};
