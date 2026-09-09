/**
 * Reading the seed fixture.
 *
 * `fixtures/baseline-seed.json` is the bootstrap for the whole suite. Both
 * remotes fetch it on first run and each imports only its own slice into its own
 * store, so the ownership boundary is about what an app stores and serves, not
 * about what this file happens to contain.
 *
 * Everything here validates rather than trusts. The file arrives over HTTP as
 * `unknown`, and a field quietly missing from it would surface much later as a
 * wrong number in a plan. Validation is written by hand instead of with a schema
 * library: the shape is small and fixed, and the error messages can name the
 * exact path that is wrong.
 *
 * The returned shape is the file's own, not the domain's. Mapping into domain
 * types is each app's job, because each app maps a different slice.
 */

export interface SeedFile {
  readonly meta: SeedMeta;
  readonly employees: readonly SeedEmployee[];
  readonly rateRecords: readonly SeedRateRecord[];
  readonly projects: readonly SeedProject[];
  readonly breakdownItems: readonly SeedBreakdownItem[];
  readonly allocations: readonly SeedAllocation[];
}

export interface SeedMeta {
  readonly name: string;
  readonly version: string;
  /** The twelve months the staffing grid opens on, as `YYYY-MM`. */
  readonly gridHorizon: { readonly from: string; readonly to: string };
}

export interface SeedEmployee {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly weeklyHours: number;
}

export interface SeedRateRecord {
  readonly id: string;
  readonly employeeId: string;
  /** `YYYY-MM-DD`, inclusive. No end date: a record runs until the next one. */
  readonly validFrom: string;
  readonly hourlyCost: number;
}

export interface SeedProject {
  readonly id: string;
  readonly name: string;
  readonly startDate: string;
  readonly endDate: string;
}

export interface SeedBreakdownItem {
  readonly id: string;
  readonly projectId: string;
  readonly parentId: string | null;
  readonly name: string;
}

export interface SeedAllocation {
  readonly id: string;
  readonly breakdownItemId: string;
  readonly employeeId: string;
  /** `YYYY-MM`. */
  readonly month: string;
  /** Person-months. Converted to the canonical unit on import. */
  readonly amount: number;
}

/** Thrown with the path of the offending field, so a bad fixture is findable. */
export class SeedFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedFormatError';
  }
}

export function parseSeed(input: unknown): SeedFile {
  const root = requireObject(input, 'seed');

  return {
    meta: parseMeta(root.meta, 'seed.meta'),
    employees: parseArray(root.employees, 'seed.employees', parseEmployee),
    rateRecords: parseArray(root.rateRecords, 'seed.rateRecords', parseRateRecord),
    projects: parseArray(root.projects, 'seed.projects', parseProject),
    breakdownItems: parseArray(root.breakdownItems, 'seed.breakdownItems', parseBreakdownItem),
    allocations: parseArray(root.allocations, 'seed.allocations', parseAllocation),
  };
}

function parseMeta(input: unknown, path: string): SeedMeta {
  const meta = requireObject(input, path);
  const horizon = requireObject(meta.gridHorizon, `${path}.gridHorizon`);

  return {
    name: requireString(meta.name, `${path}.name`),
    version: requireString(meta.version, `${path}.version`),
    gridHorizon: {
      from: requireString(horizon.from, `${path}.gridHorizon.from`),
      to: requireString(horizon.to, `${path}.gridHorizon.to`),
    },
  };
}

function parseEmployee(input: unknown, path: string): SeedEmployee {
  const employee = requireObject(input, path);

  return {
    id: requireString(employee.id, `${path}.id`),
    name: requireString(employee.name, `${path}.name`),
    role: requireString(employee.role, `${path}.role`),
    weeklyHours: requirePositiveNumber(employee.weeklyHours, `${path}.weeklyHours`),
  };
}

function parseRateRecord(input: unknown, path: string): SeedRateRecord {
  const record = requireObject(input, path);

  return {
    id: requireString(record.id, `${path}.id`),
    employeeId: requireString(record.employeeId, `${path}.employeeId`),
    validFrom: requireString(record.validFrom, `${path}.validFrom`),
    hourlyCost: requireNonNegativeNumber(record.hourlyCost, `${path}.hourlyCost`),
  };
}

function parseProject(input: unknown, path: string): SeedProject {
  const project = requireObject(input, path);

  return {
    id: requireString(project.id, `${path}.id`),
    name: requireString(project.name, `${path}.name`),
    startDate: requireString(project.startDate, `${path}.startDate`),
    endDate: requireString(project.endDate, `${path}.endDate`),
  };
}

function parseBreakdownItem(input: unknown, path: string): SeedBreakdownItem {
  const item = requireObject(input, path);
  const parentId = item.parentId;

  if (parentId !== null && typeof parentId !== 'string') {
    throw new SeedFormatError(`${path}.parentId must be a string or null`);
  }

  return {
    id: requireString(item.id, `${path}.id`),
    projectId: requireString(item.projectId, `${path}.projectId`),
    parentId,
    name: requireString(item.name, `${path}.name`),
  };
}

function parseAllocation(input: unknown, path: string): SeedAllocation {
  const allocation = requireObject(input, path);

  return {
    id: requireString(allocation.id, `${path}.id`),
    breakdownItemId: requireString(allocation.breakdownItemId, `${path}.breakdownItemId`),
    employeeId: requireString(allocation.employeeId, `${path}.employeeId`),
    month: requireString(allocation.month, `${path}.month`),
    amount: requireNonNegativeNumber(allocation.amount, `${path}.amount`),
  };
}

function parseArray<T>(
  input: unknown,
  path: string,
  parseEntry: (entry: unknown, entryPath: string) => T,
): readonly T[] {
  if (!Array.isArray(input)) {
    throw new SeedFormatError(`${path} must be an array`);
  }
  return input.map((entry, index) => parseEntry(entry, `${path}[${String(index)}]`));
}

function requireObject(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new SeedFormatError(`${path} must be an object`);
  }
  return input as Record<string, unknown>;
}

function requireString(input: unknown, path: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    throw new SeedFormatError(`${path} must be a non-empty string`);
  }
  return input;
}

function requireNonNegativeNumber(input: unknown, path: string): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0) {
    throw new SeedFormatError(`${path} must be a non-negative number`);
  }
  return input;
}

function requirePositiveNumber(input: unknown, path: string): number {
  const value = requireNonNegativeNumber(input, path);
  if (value === 0) {
    throw new SeedFormatError(`${path} must be greater than zero`);
  }
  return value;
}
