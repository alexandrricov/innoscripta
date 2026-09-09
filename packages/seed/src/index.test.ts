import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseSeed, SeedFormatError } from './index.ts';

/**
 * The real fixture, read from disk. Parsing the artifact that actually ships is
 * worth more than parsing a hand-written copy of it: if the file is ever
 * replaced, this test is what notices.
 */
const RAW_SEED: unknown = JSON.parse(
  readFileSync(new URL('../../../fixtures/baseline-seed.json', import.meta.url), 'utf8'),
);

function validSeed(): Record<string, unknown> {
  return {
    meta: {
      name: 'test',
      version: '1.0.0',
      gridHorizon: { from: '2026-04', to: '2027-03' },
      note: 'unknown fields are ignored',
    },
    employees: [{ id: 'emp-1', name: 'A', role: 'Dev', weeklyHours: 40 }],
    rateRecords: [{ id: 'rate-1', employeeId: 'emp-1', validFrom: '2025-01-01', hourlyCost: 80 }],
    projects: [{ id: 'prj-1', name: 'P', startDate: '2026-03-01', endDate: '2027-02-28' }],
    breakdownItems: [{ id: 'wbs-1', projectId: 'prj-1', parentId: null, name: 'Root' }],
    allocations: [
      {
        id: 'alloc-1',
        breakdownItemId: 'wbs-1',
        employeeId: 'emp-1',
        month: '2026-03',
        amount: 0.5,
      },
    ],
  };
}

describe('the fixture that ships with the exercise', () => {
  const seed = parseSeed(RAW_SEED);

  it('parses', () => {
    expect(seed.meta.gridHorizon).toStrictEqual({ from: '2026-04', to: '2027-03' });
  });

  it('holds the counts the exercise states', () => {
    expect(seed.employees).toHaveLength(60);
    expect(seed.rateRecords).toHaveLength(150);
    expect(seed.projects).toHaveLength(4);
    expect(seed.breakdownItems).toHaveLength(90);
    expect(seed.allocations).toHaveLength(720);
  });

  it('still contains the employee and the rate change the reference calculation uses', () => {
    const okafor = seed.employees.find((employee) => employee.id === 'emp-001');
    const rates = seed.rateRecords.filter((record) => record.employeeId === 'emp-001');

    expect(okafor).toMatchObject({ name: 'Adaeze Okafor', weeklyHours: 40 });
    expect(rates).toStrictEqual([
      { id: 'rate-001', employeeId: 'emp-001', validFrom: '2025-01-01', hourlyCost: 80 },
      { id: 'rate-002', employeeId: 'emp-001', validFrom: '2026-03-12', hourlyCost: 95 },
    ]);
  });

  it('keeps every rate record and allocation pointing at something that exists', () => {
    const employeeIds = new Set(seed.employees.map((employee) => employee.id));
    const itemIds = new Set(seed.breakdownItems.map((item) => item.id));

    for (const record of seed.rateRecords) {
      expect(employeeIds.has(record.employeeId)).toBe(true);
    }
    for (const allocation of seed.allocations) {
      expect(employeeIds.has(allocation.employeeId)).toBe(true);
      expect(itemIds.has(allocation.breakdownItemId)).toBe(true);
    }
  });
});

describe('parseSeed', () => {
  it('accepts a minimal well-formed file and ignores fields it does not know', () => {
    expect(() => parseSeed(validSeed())).not.toThrow();
  });

  it('rejects anything that is not an object', () => {
    expect(() => parseSeed(null)).toThrow(SeedFormatError);
    expect(() => parseSeed([])).toThrow(SeedFormatError);
    expect(() => parseSeed('{}')).toThrow(SeedFormatError);
  });

  it('names the path of a missing section', () => {
    const seed = validSeed();
    delete seed.allocations;

    expect(() => parseSeed(seed)).toThrow(/seed\.allocations must be an array/);
  });

  it('names the path of a bad field, down to the index', () => {
    const seed = validSeed();
    seed.employees = [
      { id: 'emp-1', name: 'A', role: 'Dev', weeklyHours: 40 },
      { id: 'emp-2', name: 'B', role: 'Dev', weeklyHours: '32' },
    ];

    expect(() => parseSeed(seed)).toThrow(/seed\.employees\[1\]\.weeklyHours/);
  });

  it('refuses a contract of zero hours', () => {
    const seed = validSeed();
    seed.employees = [{ id: 'emp-1', name: 'A', role: 'Dev', weeklyHours: 0 }];

    expect(() => parseSeed(seed)).toThrow(/greater than zero/);
  });

  it('refuses a negative rate or a negative allocation', () => {
    const withBadRate = validSeed();
    withBadRate.rateRecords = [
      { id: 'rate-1', employeeId: 'emp-1', validFrom: '2025-01-01', hourlyCost: -1 },
    ];
    expect(() => parseSeed(withBadRate)).toThrow(/hourlyCost/);

    const withBadAmount = validSeed();
    withBadAmount.allocations = [
      { id: 'a1', breakdownItemId: 'wbs-1', employeeId: 'emp-1', month: '2026-03', amount: -0.5 },
    ];
    expect(() => parseSeed(withBadAmount)).toThrow(/amount/);
  });

  it('accepts a null parentId but not a number', () => {
    const seed = validSeed();
    seed.breakdownItems = [{ id: 'wbs-1', projectId: 'prj-1', parentId: 7, name: 'Root' }];

    expect(() => parseSeed(seed)).toThrow(/parentId must be a string or null/);
  });

  it('refuses an empty string where an id belongs', () => {
    const seed = validSeed();
    seed.employees = [{ id: '', name: 'A', role: 'Dev', weeklyHours: 40 }];

    expect(() => parseSeed(seed)).toThrow(/non-empty string/);
  });
});
