// Imported here, in the exposed module, rather than in the standalone entry.
// The shell loads `./App` and nothing else, so styles hung off bootstrap.tsx
// would only ever apply when this remote runs on its own port.
import '@baseline/theme/theme.css';
import './styles.css';

import { type HostSession, sessionFromHost } from '@baseline/contracts';
import { useMemo, useState } from 'react';

import { type OverloadedMonth, useOversubscription } from './capacity/use-oversubscription.ts';
import type { Employee } from './data/people-store.ts';
import { EmployeeDetail } from './employee/employee-detail.tsx';
import { EmployeeList } from './register/employee-list.tsx';
import { matchEmployees } from './register/search.ts';
import { useEmployees } from './register/use-employees.ts';
import { SessionProvider, useHostSession } from './session.tsx';

// A stable empty list, so the memoised filter is not invalidated by a fresh []
// on every render while the register is still loading.
const NO_EMPLOYEES: readonly Employee[] = [];
const NO_MONTHS: readonly OverloadedMonth[] = [];

interface AppProps {
  /**
   * The display currency and the active user, owned by the host.
   *
   * Optional because this remote also runs on its own port with nobody pushing
   * anything in. `sessionFromHost` supplies the standalone default and checks
   * what a host did push - it arrives across a deployment boundary, so it is
   * input rather than a fact.
   */
  readonly session?: HostSession;
}

export function App({ session }: AppProps) {
  return (
    <SessionProvider session={sessionFromHost(session)}>
      <People />
    </SessionProvider>
  );
}

function People() {
  const state = useEmployees();
  const { user } = useHostSession();
  const [query, setQuery] = useState('');
  /**
   * Which employee is open is component state, not a URL.
   *
   * The shell owns navigation. A router in here would fight it for the address
   * bar, and the panel has to behave the same way hosted as it does standalone.
   */
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const employees = state.status === 'ready' ? state.employees : NO_EMPLOYEES;
  // Delivery's numbers, People's verdict: capacity is weeklyHours * workingDays / 5
  // and those hours are owned here.
  const { oversubscription, unavailable } = useOversubscription(employees);
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
            <EmployeeList
              employees={matches}
              selectedId={selectedId}
              // Whoever is signed in is marked in the register, so "find me"
              // does not mean scrolling sixty rows looking for your own name.
              activeUserId={user?.employeeId}
              oversubscription={oversubscription}
              onSelect={setSelectedId}
            />
          </div>

          {selected ? (
            <EmployeeDetail
              key={selected.id}
              employee={selected}
              overloadedMonths={oversubscription.get(selected.id) ?? NO_MONTHS}
              capacityUnavailable={unavailable}
            />
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
