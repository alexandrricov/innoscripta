// Imported here, in the exposed module, rather than in the standalone entry.
// The shell loads `./App` and nothing else, so styles hung off bootstrap.tsx
// would only ever apply when this remote runs on its own port.
import '@baseline/theme/theme.css';
import './styles.css';

import { useState } from 'react';

import { AddRootForm } from './breakdown/add-root-form.tsx';
import { childrenOf } from './breakdown/tree.ts';
import { TreeNode } from './breakdown/tree-node.tsx';
import { useBreakdown } from './breakdown/use-breakdown.ts';
import { StaffingGrid } from './grid/staffing-grid.tsx';
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

export function App() {
  /**
   * Which project is open, and which view, are component state rather than a
   * URL: the shell owns navigation, and the panel behaves the same hosted as
   * standalone.
   */
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [view, setView] = useState<View>('grid');

  const breakdown = useBreakdown(projectId);
  const grid = useGrid(projectId);

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
              {grid.namesUnavailable !== null && (
                <p className="delivery-notice delivery-notice-degraded" role="status">
                  People is unavailable, so rows are labelled by employee id. Hours still add up.
                </p>
              )}
              <StaffingGrid data={grid} />
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
