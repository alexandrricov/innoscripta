/**
 * Questions about the shape of the breakdown tree.
 *
 * All of it is pure, so all of it is tested without mounting anything. The
 * components are left holding state and rendering.
 */

import type { Allocation, BreakdownItem } from '@baseline/domain';

/** What `parentId` is for an item that sits at the root of its project. */
export const TOP_LEVEL = null;

export function childrenOf(
  items: readonly BreakdownItem[],
  parentId: string | null,
): readonly BreakdownItem[] {
  return items.filter((item) => item.parentId === parentId);
}

/**
 * Everything below `itemId`, at any depth.
 *
 * Iterative with a seen-set rather than recursive, so a `parentId` cycle in the
 * data cannot hang the interface. The domain's roll-up refuses such data
 * outright; the tree editor still has to render something.
 */
export function descendantsOf(
  items: readonly BreakdownItem[],
  itemId: string,
): readonly BreakdownItem[] {
  const collected: BreakdownItem[] = [];
  const seen = new Set<string>([itemId]);
  let frontier = [itemId];

  while (frontier.length > 0) {
    const next: string[] = [];

    for (const child of items.filter(
      (item) => item.parentId !== null && frontier.includes(item.parentId),
    )) {
      if (seen.has(child.id)) {
        continue;
      }
      seen.add(child.id);
      collected.push(child);
      next.push(child.id);
    }
    frontier = next;
  }

  return collected;
}

/** How deep an item sits, counting from zero at the root of its project. */
export function depthOf(items: readonly BreakdownItem[], itemId: string): number {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();

  let current = byId.get(itemId);
  let depth = 0;

  while (current?.parentId != null && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.parentId);
    depth += 1;
  }

  return depth;
}

/**
 * Where an item is allowed to move: anywhere in its own project except itself
 * and its own descendants.
 *
 * Moving something into its own subtree would detach the whole branch from the
 * tree and lose every hour under it, silently - the rows would simply stop
 * being rendered. Refusing it here is cheaper than detecting it afterwards.
 *
 * Top level is a valid destination too, and the caller offers it separately
 * because it is not an item.
 */
export function validMoveTargets(
  items: readonly BreakdownItem[],
  itemId: string,
): readonly BreakdownItem[] {
  const subject = items.find((item) => item.id === itemId);
  if (!subject) {
    return [];
  }

  const forbidden = new Set([itemId, ...descendantsOf(items, itemId).map((item) => item.id)]);

  return items.filter((item) => item.projectId === subject.projectId && !forbidden.has(item.id));
}

export interface DeletionImpact {
  /** The item itself plus everything under it. */
  readonly items: number;
  readonly allocations: number;
}

/**
 * What deleting an item would take with it.
 *
 * Shown to the user before anything happens. Deleting a branch is a reasonable
 * thing to want, but taking effort and money with it without saying so would be
 * the silent loss the spec calls a failure.
 */
export function deletionImpact(
  items: readonly BreakdownItem[],
  allocations: readonly Allocation[],
  itemId: string,
): DeletionImpact {
  const going = new Set([itemId, ...descendantsOf(items, itemId).map((item) => item.id)]);

  return {
    items: going.size,
    allocations: allocations.filter((allocation) => going.has(allocation.breakdownItemId)).length,
  };
}

/**
 * Why a move is not allowed, or null when it is.
 *
 * Shared by both store implementations rather than written twice. The rules are
 * where the bugs would live, so they live in one tested place.
 */
export function moveProblem(
  items: readonly BreakdownItem[],
  itemId: string,
  parentId: string | null,
): string | null {
  const subject = items.find((item) => item.id === itemId);
  if (!subject) {
    return `There is no work package "${itemId}"`;
  }

  if (parentId === TOP_LEVEL) {
    return null;
  }
  if (parentId === itemId) {
    return 'A work package cannot be moved into itself';
  }

  const target = items.find((item) => item.id === parentId);
  if (!target) {
    return `There is no work package "${parentId}"`;
  }
  if (target.projectId !== subject.projectId) {
    return 'A work package cannot be moved into a different project';
  }
  if (descendantsOf(items, itemId).some((item) => item.id === parentId)) {
    return 'A work package cannot be moved into its own subtree';
  }

  return null;
}

/** Why a name is not usable, or null when it is. */
export function nameProblem(name: string): string | null {
  return name.trim().length === 0 ? 'A work package needs a name' : null;
}

/** Ids stay recognisable as breakdown items; seeded ones keep their `wbs-001`. */
export function newItemId(): string {
  return `wbs-${crypto.randomUUID()}`;
}

/**
 * An item named by its ancestry: `Migration / Implementation`.
 *
 * Needed because names repeat across branches - the real fixture has two
 * "Implementation" packages under one project - and a list of bare names gives
 * the reader no way to tell which one they are picking.
 */
export function pathOf(items: readonly BreakdownItem[], itemId: string): string {
  const byId = new Map(items.map((item) => [item.id, item]));
  const names: string[] = [];
  const seen = new Set<string>();

  let current = byId.get(itemId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }

  return names.join(' / ');
}
