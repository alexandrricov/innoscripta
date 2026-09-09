/**
 * One contract, both implementations, plus the unit conversion the import does.
 */

import 'fake-indexeddb/auto';

import { readFileSync } from 'node:fs';

import { type Allocation, type BreakdownItem, personMonthHours, yearMonth } from '@baseline/domain';
import { parseSeed, type SeedFile } from '@baseline/seed';
import { beforeEach, describe, expect, it } from 'vitest';

import { openDeliveryDatabase, seedIfEmpty } from './delivery-database.ts';
import type { DeliveryStore } from './delivery-store.ts';
import { createInMemoryDeliveryStore } from './in-memory-delivery-store.ts';
import { createIndexedDbDeliveryStore } from './indexeddb-delivery-store.ts';
import { type DeliverySlice, deliverySliceOf } from './seed-slice.ts';

const APRIL_2026 = yearMonth(2026, 4);

function allocation(id: string, breakdownItemId: string, hours: number): Allocation {
  return {
    id,
    breakdownItemId,
    employeeId: 'emp-001',
    month: APRIL_2026,
    hours,
    editedAt: 0,
  };
}

/**
 *   root
 *     mid
 *       leaf     (two allocations)
 *   empty
 */
function fixture(): DeliverySlice {
  const items: BreakdownItem[] = [
    { id: 'root', projectId: 'p1', parentId: null, name: 'Ledger migration' },
    { id: 'mid', projectId: 'p1', parentId: 'root', name: 'Design' },
    { id: 'leaf', projectId: 'p1', parentId: 'mid', name: 'Schema' },
    { id: 'empty', projectId: 'p1', parentId: null, name: 'Reporting cut-over' },
    { id: 'elsewhere', projectId: 'p2', parentId: null, name: 'Another project' },
  ];

  return {
    projects: [
      { id: 'p1', name: 'Ledger Consolidation', startDate: '2026-03-01', endDate: '2027-02-28' },
      { id: 'p2', name: 'Reporting Platform', startDate: '2026-04-01', endDate: '2027-03-31' },
    ],
    items,
    allocations: [allocation('a1', 'leaf', 88), allocation('a2', 'leaf', 44)],
    gridHorizon: { from: '2026-04', to: '2027-03' },
  };
}

let databaseCounter = 0;

async function indexedDbStore(slice: DeliverySlice): Promise<DeliveryStore> {
  databaseCounter += 1;
  const db = await openDeliveryDatabase(`delivery-contract-${String(databaseCounter)}`);
  await seedIfEmpty(db, () => Promise.resolve(slice));

  return createIndexedDbDeliveryStore(db);
}

const implementations = [
  ['in memory', (slice: DeliverySlice) => Promise.resolve(createInMemoryDeliveryStore(slice))],
  ['indexeddb', indexedDbStore],
] as const;

describe.each(implementations)('%s', (_name, createStore) => {
  let store: DeliveryStore;

  beforeEach(async () => {
    store = await createStore(fixture());
  });

  describe('reading', () => {
    it('lists the projects', async () => {
      const projects = await store.listProjects();

      expect(projects.map((project) => project.id).sort()).toStrictEqual(['p1', 'p2']);
    });

    it('lists only one project breakdown', async () => {
      const items = await store.listBreakdown('p1');

      expect(items.map((item) => item.id).sort()).toStrictEqual(['empty', 'leaf', 'mid', 'root']);
    });

    it('lists only that project allocations', async () => {
      await expect(store.listAllocations('p1')).resolves.toHaveLength(2);
      await expect(store.listAllocations('p2')).resolves.toStrictEqual([]);
    });

    it('lists every allocation for capacity, whatever project it is in', async () => {
      await expect(store.listAllAllocations()).resolves.toHaveLength(2);
    });
  });

  describe('adding a child', () => {
    it('puts it under the parent', async () => {
      const { child } = await store.addChild('p1', 'mid', 'Mapping');

      expect(child).toMatchObject({ projectId: 'p1', parentId: 'mid', name: 'Mapping' });
      await expect(store.listBreakdown('p1')).resolves.toHaveLength(5);
    });

    it('puts it at the top of the project with a null parent', async () => {
      const { child } = await store.addChild('p1', null, 'New stream');

      expect(child.parentId).toBeNull();
    });

    it('moves the parent own allocations onto it rather than losing them, per R4', async () => {
      const { child, movedAllocations } = await store.addChild('p1', 'leaf', 'Deeper');

      expect(movedAllocations).toBe(2);

      const allocations = await store.listAllocations('p1');

      expect(allocations).toHaveLength(2);
      expect(allocations.every((entry) => entry.breakdownItemId === child.id)).toBe(true);
    });

    it('keeps the hours and the edit stamp untouched while moving them', async () => {
      const before = await store.listAllocations('p1');
      await store.addChild('p1', 'leaf', 'Deeper');
      const after = await store.listAllocations('p1');

      expect(after.map((entry) => entry.hours).sort((a, b) => a - b)).toStrictEqual(
        before.map((entry) => entry.hours).sort((a, b) => a - b),
      );
      expect(after.every((entry) => entry.editedAt === 0)).toBe(true);
    });

    it('moves nothing when the parent had nothing of its own', async () => {
      const { movedAllocations } = await store.addChild('p1', 'mid', 'Sibling');

      expect(movedAllocations).toBe(0);
      await expect(store.listAllocations('p1')).resolves.toHaveLength(2);
    });

    it('refuses a blank name', async () => {
      await expect(store.addChild('p1', 'mid', '   ')).rejects.toThrow(/needs a name/);
    });

    it('refuses a parent that does not exist, or one in another project', async () => {
      await expect(store.addChild('p1', 'ghost', 'X')).rejects.toThrow(/no work package/);
      await expect(store.addChild('p1', 'elsewhere', 'X')).rejects.toThrow(/another project/);
    });
  });

  describe('renaming', () => {
    it('renames and trims', async () => {
      await store.renameItem('mid', '  Discovery  ');

      const items = await store.listBreakdown('p1');

      expect(items.find((item) => item.id === 'mid')?.name).toBe('Discovery');
    });

    it('refuses a blank name and an unknown item', async () => {
      await expect(store.renameItem('mid', '')).rejects.toThrow(/needs a name/);
      await expect(store.renameItem('ghost', 'X')).rejects.toThrow(/no work package/);
    });
  });

  describe('moving', () => {
    it('reparents', async () => {
      await store.moveItem('leaf', 'empty');

      const items = await store.listBreakdown('p1');

      expect(items.find((item) => item.id === 'leaf')?.parentId).toBe('empty');
    });

    it('moves to the top level', async () => {
      await store.moveItem('leaf', null);

      const items = await store.listBreakdown('p1');

      expect(items.find((item) => item.id === 'leaf')?.parentId).toBeNull();
    });

    it('refuses a move into its own subtree', async () => {
      await expect(store.moveItem('root', 'leaf')).rejects.toThrow(/own subtree/);
    });

    it('refuses a move into itself and into another project', async () => {
      await expect(store.moveItem('mid', 'mid')).rejects.toThrow(/into itself/);
      await expect(store.moveItem('mid', 'elsewhere')).rejects.toThrow(/different project/);
    });

    it('leaves the allocations where they were', async () => {
      await store.moveItem('leaf', 'empty');

      const allocations = await store.listAllocations('p1');

      expect(allocations.every((entry) => entry.breakdownItemId === 'leaf')).toBe(true);
    });
  });

  describe('deleting', () => {
    it('takes the whole subtree', async () => {
      await store.deleteItem('root');

      await expect(store.listBreakdown('p1')).resolves.toHaveLength(1);
    });

    it('takes the allocations under it too', async () => {
      await store.deleteItem('root');

      await expect(store.listAllocations('p1')).resolves.toStrictEqual([]);
      await expect(store.listAllAllocations()).resolves.toStrictEqual([]);
    });

    it('leaves other branches alone', async () => {
      await store.deleteItem('empty');

      await expect(store.listBreakdown('p1')).resolves.toHaveLength(3);
      await expect(store.listAllocations('p1')).resolves.toHaveLength(2);
    });

    it('does nothing twice over rather than failing', async () => {
      await store.deleteItem('empty');

      await expect(store.deleteItem('empty')).resolves.toBeUndefined();
    });
  });

  describe('allocations', () => {
    it('saves and replaces by id', async () => {
      await store.saveAllocation(allocation('a1', 'leaf', 99));

      const allocations = await store.listAllocations('p1');

      expect(allocations).toHaveLength(2);
      expect(allocations.find((entry) => entry.id === 'a1')?.hours).toBe(99);
    });

    it('removes one', async () => {
      await store.removeAllocation('a1');

      await expect(store.listAllocations('p1')).resolves.toHaveLength(1);
    });

    it('refuses one pointing at no work package', async () => {
      await expect(store.saveAllocation(allocation('a9', 'ghost', 10))).rejects.toThrow(
        /unknown work package/,
      );
    });
  });
});

describe('the unit conversion the import does', () => {
  const seed = parseSeed(
    JSON.parse(
      readFileSync(new URL('../../../../fixtures/baseline-seed.json', import.meta.url), 'utf8'),
    ),
  );
  const slice = deliverySliceOf(seed);

  it('turns the reference cell 0.50 person-months into 88 hours', () => {
    // alloc-001: emp-001 on 40 h/week, March 2026, 0.5 person-months.
    const referenceCell = slice.allocations.find((entry) => entry.id === 'alloc-001');

    expect(referenceCell).toMatchObject({
      employeeId: 'emp-001',
      month: { year: 2026, month: 3 },
      hours: 88,
    });
  });

  it('uses that person contract, not a fixed number of hours', () => {
    const partTime = seed.employees.find((employee) => employee.weeklyHours === 32);
    expect(partTime).toBeDefined();

    const theirs = seed.allocations.find((entry) => entry.employeeId === partTime?.id);
    expect(theirs).toBeDefined();

    const converted = slice.allocations.find((entry) => entry.id === theirs?.id);
    const month = converted?.month;
    expect(month).toBeDefined();

    if (theirs && partTime && converted && month) {
      expect(converted.hours).toBeCloseTo(theirs.amount * personMonthHours(32, month), 10);
      // The same amount on a 40 h/week contract would be worth more hours.
      expect(converted.hours).toBeLessThan(theirs.amount * personMonthHours(40, month));
    }
  });

  it('carries every allocation across and marks none of them as edited', () => {
    expect(slice.allocations).toHaveLength(720);
    expect(slice.allocations.every((entry) => entry.editedAt === 0)).toBe(true);
  });

  it('keeps the horizon the fixture states', () => {
    expect(slice.gridHorizon).toStrictEqual({ from: '2026-04', to: '2027-03' });
  });

  it('refuses an allocation whose employee is not in the file', () => {
    const broken: SeedFile = {
      ...seed,
      allocations: [
        {
          id: 'x',
          breakdownItemId: 'wbs-001',
          employeeId: 'emp-999',
          month: '2026-04',
          amount: 0.5,
        },
      ],
    };

    expect(() => deliverySliceOf(broken)).toThrow(/unknown employee "emp-999"/);
  });
});

describe('the grid horizon', () => {
  it('comes back as twelve months for both implementations', async () => {
    for (const [, createStore] of implementations) {
      const store = await createStore(fixture());
      const horizon = await store.gridHorizon();

      expect(horizon).toHaveLength(12);
      expect(horizon[0]).toStrictEqual({ year: 2026, month: 4 });
      expect(horizon[11]).toStrictEqual({ year: 2027, month: 3 });
    }
  });

  it('is written by seeding even when the plan is already there', async () => {
    // A database created before the meta store existed: version 2 adds the
    // store, and seeding has to fill the horizon without importing the plan on
    // top of somebody's edits.
    databaseCounter += 1;
    const db = await openDeliveryDatabase(`horizon-test-${String(databaseCounter)}`);
    await seedIfEmpty(db, () => Promise.resolve(fixture()));

    await db.delete('meta', 'gridHorizon');
    await db.put('breakdownItems', {
      id: 'edited-by-hand',
      projectId: 'p1',
      parentId: null,
      name: 'Mine',
    });

    let imports = 0;
    await seedIfEmpty(db, () => {
      imports += 1;
      return Promise.resolve(fixture());
    });

    expect(imports).toBe(1);
    await expect(db.get('meta', 'gridHorizon')).resolves.toStrictEqual({
      from: '2026-04',
      to: '2027-03',
    });
    // The hand-made item is still there: nothing was re-imported over it.
    await expect(db.get('breakdownItems', 'edited-by-hand')).resolves.toBeDefined();
    await expect(db.count('breakdownItems')).resolves.toBe(6);
  });
});
