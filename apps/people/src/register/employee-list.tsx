import type { Employee } from '../data/people-store.ts';

interface EmployeeListProps {
  readonly employees: readonly Employee[];
  readonly selectedId: string | undefined;
  readonly onSelect: (employeeId: string) => void;
}

export function EmployeeList({ employees, selectedId, onSelect }: EmployeeListProps) {
  if (employees.length === 0) {
    return <p className="people-notice">Nobody in the register matches that.</p>;
  }

  return (
    <ul className="people-register-list">
      {employees.map((employee) => (
        <li key={employee.id}>
          {/*
            A real button, not a div with a click handler: it has to be reachable
            by Tab and operable with Enter and Space without any of that being
            written by hand.
          */}
          <button
            type="button"
            className="people-register-row"
            aria-current={employee.id === selectedId ? 'true' : undefined}
            onClick={() => {
              onSelect(employee.id);
            }}
          >
            <span className="people-register-name">{employee.name}</span>
            <span className="people-register-role">{employee.role}</span>
            <span className="people-register-hours">
              {employee.weeklyHours}
              <span className="people-register-unit"> h/week</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
