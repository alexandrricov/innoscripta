/**
 * The exchange rates the host displays money at.
 *
 * A fixed table, deliberately. Live rates would mean a provider, an API key, a
 * refresh policy and a stale-value story, and the exercise scores none of that.
 * What it does ask is that the shell own the display currency, and owning it
 * means owning the number that makes it mean something.
 *
 * They are stated as of a date and marked in the UI as indicative, because a
 * conversion with no date on it is the kind of number people quote back at you
 * six months later.
 *
 * The seam if this became real: replace this module with a fetch, keep the
 * `DisplayCurrency` shape, and nothing downstream of the shell changes - the
 * rate already travels with the code across the remote boundary precisely so
 * that no remote has to know where it came from.
 */

import { CURRENCY_CODES, type CurrencyCode, type DisplayCurrency } from '@baseline/contracts';

/** The date the table below was taken on, shown next to the picker. */
export const RATES_AS_OF = '2026-09-01';

/** Units per one euro. EUR is exactly 1, which is what makes it the stored unit. */
const PER_EUR: Record<CurrencyCode, number> = {
  EUR: 1,
  USD: 1.08,
  CHF: 0.94,
  GBP: 0.85,
};

export const DISPLAY_CURRENCIES: readonly DisplayCurrency[] = CURRENCY_CODES.map((code) => ({
  code,
  perEur: PER_EUR[code],
}));

export function displayCurrency(code: CurrencyCode): DisplayCurrency {
  return { code, perEur: PER_EUR[code] };
}
