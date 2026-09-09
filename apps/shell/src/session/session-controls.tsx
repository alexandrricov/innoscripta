/**
 * The header controls for the two host-owned values.
 *
 * Both are plain `<select>` elements. A custom dropdown would be a listbox with
 * arrow keys, typeahead and focus management to build by hand - the exercise
 * forbids component kits - and a native select already has all of it.
 */

import { type CurrencyCode, type EmployeeSummary, type HostSession } from '@baseline/contracts';

import { DISPLAY_CURRENCIES, RATES_AS_OF } from './currency-rates.ts';

interface SessionControlsProps {
  readonly session: HostSession;
  readonly people: readonly EmployeeSummary[];
  readonly peopleUnavailable: string | null;
  readonly onCurrencyChange: (code: CurrencyCode) => void;
  readonly onUserChange: (employeeId: string | undefined) => void;
}

const SIGNED_OUT = '';

export function SessionControls({
  session,
  people,
  peopleUnavailable,
  onCurrencyChange,
  onUserChange,
}: SessionControlsProps) {
  const { currency, user } = session;

  return (
    <div className="shell-session">
      <p className="shell-session-field">
        <label htmlFor="shell-currency">Currency</label>
        <select
          id="shell-currency"
          value={currency.code}
          onChange={(event) => {
            onCurrencyChange(event.target.value as CurrencyCode);
          }}
        >
          {DISPLAY_CURRENCIES.map((candidate) => (
            <option key={candidate.code} value={candidate.code}>
              {candidate.code}
            </option>
          ))}
        </select>
        {/* A converted figure with no date on it is a number people quote back
            at you later. Say what it is while it is on screen. */}
        <span className="shell-session-note">
          {currency.code === 'EUR'
            ? 'as stored'
            : `indicative, ${currency.perEur.toFixed(2)} per EUR as of ${RATES_AS_OF}`}
        </span>
      </p>

      <p className="shell-session-field">
        <label htmlFor="shell-user">Signed in as</label>
        <select
          id="shell-user"
          value={user?.employeeId ?? SIGNED_OUT}
          disabled={people.length === 0}
          onChange={(event) => {
            const picked = event.target.value;
            onUserChange(picked === SIGNED_OUT ? undefined : picked);
          }}
        >
          <option value={SIGNED_OUT}>Nobody</option>
          {people.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
        {peopleUnavailable !== null && (
          <span className="shell-session-note" role="status">
            People is unavailable, so there is nobody to sign in as.
          </span>
        )}
      </p>
    </div>
  );
}
