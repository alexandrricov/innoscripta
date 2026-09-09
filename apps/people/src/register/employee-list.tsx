import type { Employee } from '../data/people-store.ts';

interface EmployeeListProps {
  readonly employees: readonly Employee[];
}

export function EmployeeList({ employees }: EmployeeListProps) {
  return (
    <ul className="people-register-list">
      {employees.map((employee) => (
        <li key={employee.id} className="people-register-row">
          <span className="people-register-name">{employee.name}</span>
          <span className="people-register-role">{employee.role}</span>
          <span className="people-register-hours">
            {employee.weeklyHours}
            <span className="people-register-unit"> h/week</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
