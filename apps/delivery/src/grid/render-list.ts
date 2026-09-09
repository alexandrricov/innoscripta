import type { BreakdownRow, FlatRow } from '@baseline/domain';

/**
 * The table's rows, with a place to staff each work package that can be staffed.
 *
 * An "add somebody" row belongs after a work package's own assignment rows, and
 * only where assignments can live: a package with child packages holds no
 * people of its own.
 */
export type RenderEntry =
  | { readonly kind: 'row'; readonly row: BreakdownRow; readonly depth: number }
  | {
      readonly kind: 'addPerson';
      readonly itemId: string;
      readonly itemName: string;
      readonly depth: number;
    };

export function renderList(rows: readonly FlatRow[]): readonly RenderEntry[] {
  const entries: RenderEntry[] = [];
  const pending: { itemId: string; itemName: string; depth: number }[] = [];

  // A pending "add somebody" row is emitted once the block it belongs to ends,
  // which is the first row at the same depth or shallower.
  const flushTo = (depth: number): void => {
    while ((pending.at(-1)?.depth ?? -1) >= depth) {
      const next = pending.pop();
      if (next) {
        entries.push({ kind: 'addPerson', ...next });
      }
    }
  };

  for (const { row, depth } of rows) {
    flushTo(depth);
    entries.push({ kind: 'row', row, depth });

    // People can only sit on a package that holds no packages of its own.
    if (row.kind === 'item' && !row.children.some((child) => child.kind === 'item')) {
      pending.push({ itemId: row.id, itemName: row.name, depth });
    }
  }
  flushTo(0);

  return entries;
}
