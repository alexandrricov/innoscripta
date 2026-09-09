import { type Allocation, type BreakdownItem, yearMonth } from '@baseline/domain';
import { describe, expect, it } from 'vitest';

import {
  childrenOf,
  deletionImpact,
  depthOf,
  descendantsOf,
  moveProblem,
  nameProblem,
  newItemId,
  pathOf,
  validMoveTargets,
} from './tree.ts';

/**
 *   root
 *     mid
 *       leafOne
 *       leafTwo
 *     other
 *   secondRoot
 *   (elsewhere, in another project)
 */
const ITEMS: readonly BreakdownItem[] = [
  { id: 'root', projectId: 'p1', parentId: null, name: 'Ledger migration' },
  { id: 'mid', projectId: 'p1', parentId: 'root', name: 'Design' },
  { id: 'leafOne', projectId: 'p1', parentId: 'mid', name: 'Schema' },
  { id: 'leafTwo', projectId: 'p1', parentId: 'mid', name: 'Mapping' },
  { id: 'other', projectId: 'p1', parentId: 'root', name: 'Build' },
  { id: 'secondRoot', projectId: 'p1', parentId: null, name: 'Reporting cut-over' },
  { id: 'elsewhere', projectId: 'p2', parentId: null, name: 'Another project' },
];

function allocation(id: string, breakdownItemId: string): Allocation {
  return {
    id,
    breakdownItemId,
    employeeId: 'emp-001',
    month: yearMonth(2026, 4),
    hours: 10,
    editedAt: 0,
  };
}

const ALLOCATIONS: readonly Allocation[] = [
  allocation('a1', 'leafOne'),
  allocation('a2', 'leafOne'),
  allocation('a3', 'leafTwo'),
  allocation('a4', 'other'),
  allocation('a5', 'secondRoot'),
];

describe('childrenOf', () => {
  it('finds the roots of a project with null', () => {
    expect(childrenOf(ITEMS, null).map((item) => item.id)).toStrictEqual([
      'root',
      'secondRoot',
      'elsewhere',
    ]);
  });

  it('finds direct children only', () => {
    expect(childrenOf(ITEMS, 'root').map((item) => item.id)).toStrictEqual(['mid', 'other']);
    expect(childrenOf(ITEMS, 'leafOne')).toStrictEqual([]);
  });
});

describe('descendantsOf', () => {
  it('goes all the way down', () => {
    expect(
      descendantsOf(ITEMS, 'root')
        .map((item) => item.id)
        .sort(),
    ).toStrictEqual(['leafOne', 'leafTwo', 'mid', 'other']);
  });

  it('is empty for a leaf', () => {
    expect(descendantsOf(ITEMS, 'leafOne')).toStrictEqual([]);
  });

  it('does not hang on a parentId cycle', () => {
    const cyclic: BreakdownItem[] = [
      { id: 'a', projectId: 'p1', parentId: 'b', name: 'A' },
      { id: 'b', projectId: 'p1', parentId: 'a', name: 'B' },
    ];

    expect(descendantsOf(cyclic, 'a').map((item) => item.id)).toStrictEqual(['b']);
  });
});

describe('depthOf', () => {
  it('counts from zero at a root', () => {
    expect(depthOf(ITEMS, 'root')).toBe(0);
    expect(depthOf(ITEMS, 'mid')).toBe(1);
    expect(depthOf(ITEMS, 'leafOne')).toBe(2);
  });

  it('does not hang on a cycle', () => {
    const cyclic: BreakdownItem[] = [
      { id: 'a', projectId: 'p1', parentId: 'b', name: 'A' },
      { id: 'b', projectId: 'p1', parentId: 'a', name: 'B' },
    ];

    expect(depthOf(cyclic, 'a')).toBeLessThan(5);
  });
});

describe('validMoveTargets', () => {
  it('offers everything in the project except the item and its own subtree', () => {
    expect(
      validMoveTargets(ITEMS, 'mid')
        .map((item) => item.id)
        .sort(),
    ).toStrictEqual(['other', 'root', 'secondRoot']);
  });

  it('refuses moving something into its own descendant', () => {
    const targets = validMoveTargets(ITEMS, 'root').map((item) => item.id);

    expect(targets).not.toContain('mid');
    expect(targets).not.toContain('leafOne');
    expect(targets).toStrictEqual(['secondRoot']);
  });

  it('never offers the item itself', () => {
    for (const item of ITEMS) {
      expect(validMoveTargets(ITEMS, item.id).map((target) => target.id)).not.toContain(item.id);
    }
  });

  it('stays inside the project', () => {
    expect(validMoveTargets(ITEMS, 'mid').map((item) => item.id)).not.toContain('elsewhere');
  });

  it('offers a leaf every other item in the project', () => {
    expect(
      validMoveTargets(ITEMS, 'leafOne')
        .map((item) => item.id)
        .sort(),
    ).toStrictEqual(['leafTwo', 'mid', 'other', 'root', 'secondRoot']);
  });

  it('says nothing about an item that does not exist', () => {
    expect(validMoveTargets(ITEMS, 'ghost')).toStrictEqual([]);
  });
});

describe('deletionImpact', () => {
  it('counts the item itself when it is a leaf', () => {
    expect(deletionImpact(ITEMS, ALLOCATIONS, 'leafOne')).toStrictEqual({
      items: 1,
      allocations: 2,
    });
  });

  it('counts the whole subtree and everything allocated in it', () => {
    // mid plus leafOne and leafTwo; a1, a2 on leafOne and a3 on leafTwo.
    expect(deletionImpact(ITEMS, ALLOCATIONS, 'mid')).toStrictEqual({
      items: 3,
      allocations: 3,
    });
  });

  it('counts a whole project root', () => {
    // root, mid, leafOne, leafTwo, other; a1 a2 a3 a4.
    expect(deletionImpact(ITEMS, ALLOCATIONS, 'root')).toStrictEqual({
      items: 5,
      allocations: 4,
    });
  });

  it('counts nothing allocated when nothing is', () => {
    expect(deletionImpact(ITEMS, [], 'root')).toStrictEqual({ items: 5, allocations: 0 });
  });
});

describe('moveProblem', () => {
  it('allows a move to another branch of the same project', () => {
    expect(moveProblem(ITEMS, 'leafOne', 'other')).toBeNull();
  });

  it('allows a move to the top level', () => {
    expect(moveProblem(ITEMS, 'leafOne', null)).toBeNull();
  });

  it('refuses a move into itself', () => {
    expect(moveProblem(ITEMS, 'mid', 'mid')).toMatch(/into itself/);
  });

  it('refuses a move into its own subtree, which would detach the branch', () => {
    expect(moveProblem(ITEMS, 'root', 'leafOne')).toMatch(/own subtree/);
    expect(moveProblem(ITEMS, 'mid', 'leafTwo')).toMatch(/own subtree/);
  });

  it('refuses a move into another project', () => {
    expect(moveProblem(ITEMS, 'mid', 'elsewhere')).toMatch(/different project/);
  });

  it('refuses an unknown item or an unknown destination', () => {
    expect(moveProblem(ITEMS, 'ghost', 'root')).toMatch(/no work package "ghost"/);
    expect(moveProblem(ITEMS, 'mid', 'ghost')).toMatch(/no work package "ghost"/);
  });

  it('agrees with validMoveTargets', () => {
    for (const item of ITEMS) {
      const allowed = new Set(validMoveTargets(ITEMS, item.id).map((target) => target.id));

      for (const candidate of ITEMS) {
        expect(moveProblem(ITEMS, item.id, candidate.id) === null).toBe(allowed.has(candidate.id));
      }
    }
  });
});

describe('nameProblem', () => {
  it('accepts a name', () => {
    expect(nameProblem('Design')).toBeNull();
  });

  it('refuses nothing and refuses whitespace', () => {
    expect(nameProblem('')).toMatch(/needs a name/);
    expect(nameProblem('   ')).toMatch(/needs a name/);
  });
});

describe('newItemId', () => {
  it('is recognisable and unique', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newItemId()));

    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id.startsWith('wbs-')).toBe(true);
    }
  });
});

describe('pathOf', () => {
  it('names a root by itself', () => {
    expect(pathOf(ITEMS, 'root')).toBe('Ledger migration');
  });

  it('names a deep item by its ancestry', () => {
    expect(pathOf(ITEMS, 'leafOne')).toBe('Ledger migration / Design / Schema');
  });

  it('tells apart two items that share a name', () => {
    const repeated: BreakdownItem[] = [
      { id: 'r1', projectId: 'p1', parentId: null, name: 'Migration' },
      { id: 'r2', projectId: 'p1', parentId: null, name: 'Reporting' },
      { id: 'c1', projectId: 'p1', parentId: 'r1', name: 'Implementation' },
      { id: 'c2', projectId: 'p1', parentId: 'r2', name: 'Implementation' },
    ];

    expect(pathOf(repeated, 'c1')).toBe('Migration / Implementation');
    expect(pathOf(repeated, 'c2')).toBe('Reporting / Implementation');
  });

  it('says nothing about an item that does not exist', () => {
    expect(pathOf(ITEMS, 'ghost')).toBe('');
  });

  it('does not hang on a cycle', () => {
    const cyclic: BreakdownItem[] = [
      { id: 'a', projectId: 'p1', parentId: 'b', name: 'A' },
      { id: 'b', projectId: 'p1', parentId: 'a', name: 'B' },
    ];

    expect(pathOf(cyclic, 'a')).toBe('B / A');
  });
});
