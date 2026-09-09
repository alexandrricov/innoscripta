import { GRID_UNITS, type GridUnit } from '@baseline/domain';

interface UnitSwitcherProps {
  readonly unit: GridUnit;
  readonly onChange: (unit: GridUnit) => void;
  readonly disabled: ReadonlySet<GridUnit>;
}

const LABELS: Record<GridUnit, string> = {
  personMonths: 'PM',
  hours: 'Hours',
  percent: '%',
  cost: 'Cost',
};

export function UnitSwitcher({ unit, onChange, disabled }: UnitSwitcherProps) {
  return (
    <nav className="delivery-units" aria-label="Display unit">
      <ul>
        {GRID_UNITS.map((candidate) => (
          <li key={candidate}>
            <button
              type="button"
              className="delivery-unit-button"
              aria-current={candidate === unit ? 'true' : undefined}
              disabled={disabled.has(candidate)}
              onClick={() => {
                onChange(candidate);
              }}
            >
              {LABELS[candidate]}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
