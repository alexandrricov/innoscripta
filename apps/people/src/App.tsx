// Imported here, in the exposed module, rather than in the standalone entry.
// The shell loads `./App` and nothing else, so styles hung off bootstrap.tsx
// would only ever apply when this remote runs on its own port.
import '@baseline/theme/theme.css';
import './styles.css';

import { EmployeeList } from './register/employee-list.tsx';
import { useEmployees } from './register/use-employees.ts';

export function App() {
  const state = useEmployees();

  return (
    <section className="people-app" aria-labelledby="people-heading">
      <header className="people-header">
        <h2 id="people-heading">People</h2>
        {state.status === 'ready' && (
          <p className="people-count">{state.employees.length} employees</p>
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

      {state.status === 'ready' && <EmployeeList employees={state.employees} />}
    </section>
  );
}
