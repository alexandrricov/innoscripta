import {
  type Allocation,
  type BreakdownItem,
  flattenRows,
  rollUpHours,
  yearMonth,
} from '@baseline/domain';
import { describe, expect, it } from 'vitest';

import { renderList } from './render-list.ts';

const HORIZON = [yearMonth(2026, 4)];

/**
 *   root            has a child package, so holds nobody
 *     leafOne       staffable
 *       okafor
 *       brandt
 *     leafTwo       staffable, nobody on it yet
 *   emptyRoot       staffable
 */
const ITEMS: readonly BreakdownItem[] = [
  { id: 'root', projectId: 'p1', parentId: null, name: 'Root' },
  { id: 'leafOne', projectId: 'p1', parentId: 'root', name: 'One' },
  { id: 'leafTwo', projectId: 'p1', parentId: 'root', name: 'Two' },
  { id: 'emptyRoot', projectId: 'p1', parentId: null, name: 'Empty' },
];

function allocation(id: string, employeeId: string): Allocation {
  return {
    id,
    breakdownItemId: 'leafOne',
    employeeId,
    month: yearMonth(2026, 4),
    hours: 10,
    editedAt: 0,
  };
}

const ENTRIES = renderList(
  flattenRows(
    rollUpHours(ITEMS, [allocation('a1', 'okafor'), allocation('a2', 'brandt')], HORIZON),
  ),
);

function describeEntry(entry: (typeof ENTRIES)[number]): string {
  if (entry.kind === 'addPerson') {
    return `+ ${entry.itemName}`;
  }
  return entry.row.kind === 'item' ? entry.row.name : entry.row.employeeId;
}

describe('renderList', () => {
  it('puts the staffing row after that package own people', () => {
    expect(ENTRIES.map(describeEntry)).toStrictEqual([
      'Root',
      'One',
      'okafor',
      'brandt',
      '+ One',
      'Two',
      '+ Two',
      'Empty',
      '+ Empty',
    ]);
  });

  it('offers no staffing row on a package that holds child packages', () => {
    expect(ENTRIES.filter((entry) => entry.kind === 'addPerson').map(describeEntry)).not.toContain(
      '+ Root',
    );
  });

  it('offers one on a package with nobody on it yet', () => {
    expect(ENTRIES.map(describeEntry)).toContain('+ Two');
  });

  it('keeps every row of the tree', () => {
    expect(ENTRIES.filter((entry) => entry.kind === 'row')).toHaveLength(6);
  });
});
