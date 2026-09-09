// Imported here, in the exposed module, rather than in the standalone entry.
// The shell loads `./App` and nothing else, so styles hung off bootstrap.tsx
// would only ever apply when this remote runs on its own port.
import '@baseline/theme/theme.css';
import './styles.css';

import type { GridUnit } from '@baseline/domain';
import { useState } from 'react';

import { AddRootForm } from './breakdown/add-root-form.tsx';
import { childrenOf } from './breakdown/tree.ts';
import { TreeNode } from './breakdown/tree-node.tsx';
import { useBreakdown } from './breakdown/use-breakdown.ts';
import { StaffingGrid } from './grid/staffing-grid.tsx';
import { UnitSwitcher } from './grid/unit-switcher.tsx';
import { useGrid } from './grid/use-grid.ts';

/**
 * The grid's row headers are the breakdown tree, so showing both at once would
 * put the same tree on screen twice. One view at a time instead: the plan, or
 * the structure that holds it.
 */
type View = 'grid' | 'structure';

const VIEW_LABELS: Record<View, string> = {
  grid: 'Staffing grid',
  structure: 'Work breakdown',
};

const EVERY_UNIT_AVAILABLE: ReadonlySet<GridUnit> = new Set();
const UNITS_NEEDING_PEOPLE: ReadonlySet<GridUnit> = new Set(['personMonths', 'percent', 'cost']);

export function App() {
  /**
   * Which project is open, and which view, are component state rather than a
   * URL: the shell owns navigation, and the panel behaves the same hosted as
   * standalone.
   */
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [view, setView] = useState<View>('grid');
  // Person-months is the default the specification's own figure shows.
  const [unit, setUnit] = useState<GridUnit>('personMonths');

  const breakdown = useBreakdown(projectId);
  const grid = useGrid(projectId, unit);

  // Falling back rather than showing a grid of blanks: without People the only
  // unit that means anything is hours.
  const shownUnit: GridUnit =
    grid.status === 'ready' && grid.peopleUnavailable !== null ? 'hours' : unit;

  return (
    <section className="delivery-app" aria-labelledby="delivery-heading">
      <header className="delivery-header">
        <h2 id="delivery-heading">Delivery</h2>

        <nav className="delivery-views" aria-label="View">
          <ul>
            {(Object.keys(VIEW_LABELS) as View[]).map((candidate) => (
              <li key={candidate}>
                <button
                  type="button"
                  className="delivery-view-button"
                  aria-current={candidate === view ? 'page' : undefined}
                  onClick={() => {
                    setView(candidate);
                  }}
                >
                  {VIEW_LABELS[candidate]}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {breakdown.status === 'ready' && breakdown.projects.length > 0 && (
          <p className="delivery-project-picker">
            <label htmlFor="delivery-project">Project</label>
            <select
              id="delivery-project"
              value={projectId ?? breakdown.projects[0]?.id ?? ''}
              onChange={(event) => {
                setProjectId(event.target.value);
              }}
            >
              {breakdown.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </p>
        )}
      </header>

      {view === 'grid' && (
        <>
          {grid.status === 'loading' && (
            <p className="delivery-notice" aria-busy="true">
              Loading the plan...
            </p>
          )}

          {grid.status === 'failed' && (
            <p className="delivery-notice delivery-notice-failed" role="alert">
              The plan could not be loaded. {grid.message}
            </p>
          )}

          {grid.status === 'ready' && (
            <>
              <div className="delivery-grid-controls">
                <UnitSwitcher
                  unit={shownUnit}
                  onChange={setUnit}
                  // Everything but hours needs the size of a person-month or the
                  // price of an hour, and both belong to People.
                  disabled={
                    grid.peopleUnavailable === null ? EVERY_UNIT_AVAILABLE : UNITS_NEEDING_PEOPLE
                  }
                />

                {shownUnit === 'percent' && (
                  <p className="delivery-grid-hint">
                    % of capacity is a percentage of one person&rsquo;s month, so work packages show
                    none.
                  </p>
                )}
              </div>

              {grid.peopleUnavailable !== null && (
                <p className="delivery-notice delivery-notice-degraded" role="status">
                  People is unavailable, so rows are labelled by employee id and only hours can be
                  shown. Nothing else here needs it.
                </p>
              )}

              <StaffingGrid data={grid} actions={grid} unit={shownUnit} />
            </>
          )}
        </>
      )}

      {view === 'structure' && (
        <>
          {breakdown.status === 'loading' && (
            <p className="delivery-notice" aria-busy="true">
              Loading the plan...
            </p>
          )}

          {breakdown.status === 'failed' && (
            <p className="delivery-notice delivery-notice-failed" role="alert">
              The plan could not be loaded. {breakdown.message}
            </p>
          )}

          {breakdown.status === 'ready' && (
            <>
              <ul className="delivery-tree">
                {childrenOf(breakdown.items, null).map((root) => (
                  <TreeNode
                    key={root.id}
                    item={root}
                    items={breakdown.items}
                    allocations={breakdown.allocations}
                    actions={breakdown}
                    depth={0}
                  />
                ))}
              </ul>

              <AddRootForm onAdd={(name) => breakdown.addChild(null, name)} />
            </>
          )}
        </>
      )}
    </section>
  );
}
