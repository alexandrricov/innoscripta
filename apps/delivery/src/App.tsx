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

export function App() {
  /**
   * Which project is open is component state, not a URL, for the same reason as
   * in People: the shell owns navigation, and the panel has to behave the same
   * hosted as standalone.
   */
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const breakdown = useBreakdown(projectId);

  return (
    <section className="delivery-app" aria-labelledby="delivery-heading">
      <header className="delivery-header">
        <h2 id="delivery-heading">Delivery</h2>

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
    </section>
  );
}
