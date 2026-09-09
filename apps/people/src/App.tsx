// Imported here, in the exposed module, rather than in the standalone entry.
// The shell loads `./App` and nothing else, so styles hung off bootstrap.tsx
// would only ever apply when this remote runs on its own port.
import '@baseline/theme/theme.css';
import './styles.css';

import { useMemo, useState } from 'react';

import type { Employee } from './data/people-store.ts';
import { EmployeeDetail } from './employee/employee-detail.tsx';
import { EmployeeList } from './register/employee-list.tsx';
import { matchEmployees } from './register/search.ts';
import { useEmployees } from './register/use-employees.ts';

// A stable empty list, so the memoised filter is not invalidated by a fresh []
// on every render while the register is still loading.
const NO_EMPLOYEES: readonly Employee[] = [];

export function App() {
  const state = useEmployees();
  const [query, setQuery] = useState('');
  /**
   * Which employee is open is component state, not a URL.
   *
   * The shell owns navigation. A router in here would fight it for the address
   * bar, and the panel has to behave the same way hosted as it does standalone.
   */
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const employees = state.status === 'ready' ? state.employees : NO_EMPLOYEES;
  const matches = useMemo(() => matchEmployees(employees, query), [employees, query]);
  const selected = employees.find((employee) => employee.id === selectedId);

  return (
    <section className="people-app" aria-labelledby="people-heading">
      <header className="people-header">
        <h2 id="people-heading">People</h2>
        {state.status === 'ready' && (
          <p className="people-count">
            {matches.length === employees.length
              ? `${String(employees.length)} employees`
              : `${String(matches.length)} of ${String(employees.length)} employees`}
          </p>
        )}
      </header>

      {state.status === 'loading' && (
        <p className="people-notice" aria-busy="true">
          Loading the register...
        </p>
      )}

      {state.status === 'failed' && (
        <p className="people-notice people-notice-failed" role="alert">
          The register could not be loaded. {state.message}
        </p>
      )}

      {state.status === 'ready' && (
        <div className="people-columns">
          <div className="people-register">
            <label className="people-search-label" htmlFor="people-search">
              Search the register
            </label>
            <input
              id="people-search"
              className="people-search"
              type="search"
              placeholder="Name or role"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
            <EmployeeList employees={matches} selectedId={selectedId} onSelect={setSelectedId} />
          </div>

          {selected ? (
            <EmployeeDetail key={selected.id} employee={selected} />
          ) : (
            <p className="people-notice people-detail-empty">
              Pick somebody to see and edit their cost-rate history.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
