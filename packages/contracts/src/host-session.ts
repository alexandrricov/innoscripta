/**
 * What the host pushes into every remote at runtime.
 *
 * The shell owns the display currency and the active user. Neither is a remote's
 * business to decide: two panels on one page showing money in two different
 * currencies would be a bug, and "who is signed in" is one answer for the whole
 * suite.
 *
 * It arrives as a prop on the exposed `./App`, not through a shared module or a
 * global. Three reasons:
 *
 * - A remote runs standalone too, and a prop has an obvious default there
 *   (`DEFAULT_SESSION`). A global would be absent instead.
 * - Federation shares one React instance, but a React context created in the
 *   shell and read in a remote depends on both sides resolving the same module
 *   instance. A prop depends on nothing.
 * - It re-renders. A mutable global would need its own change notification, and
 *   props already have one.
 *
 * The remote turns the prop into its own context at its own root, so the value
 * only has to be threaded once per app.
 */

/**
 * The currencies the suite can display.
 *
 * EUR first because the stored data is in EUR: rate records carry an hourly cost
 * with no currency on them, and the exercise's own figures are euros.
 */
export const CURRENCY_CODES = ['EUR', 'USD', 'CHF', 'GBP'] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/**
 * A display currency and the factor to reach it from the stored euro.
 *
 * The rate travels with the code deliberately. A remote that received only
 * `'USD'` would have to know a rate from somewhere, and then two remotes could
 * disagree about what a dollar is. Whoever owns the currency owns its rate.
 */
export interface DisplayCurrency {
  readonly code: CurrencyCode;
  /** Units of `code` per one euro. Exactly 1 for EUR. */
  readonly perEur: number;
}

/** Whoever is signed in, as the remotes need to know them. */
export interface ActiveUser {
  /** An employee id from the register, so a remote can recognise their rows. */
  readonly employeeId: string;
  readonly name: string;
}

export interface HostSession {
  readonly currency: DisplayCurrency;
  /** Null when nobody is signed in, which is a normal state, not an error. */
  readonly user: ActiveUser | null;
}

/**
 * What a remote uses when nothing was pushed in: running standalone.
 *
 * Euros at par and nobody signed in. Standalone is a development and debugging
 * mode, so the honest default is the raw stored data with no conversion applied
 * to it at all.
 */
export const DEFAULT_SESSION: HostSession = {
  currency: { code: 'EUR', perEur: 1 },
  user: null,
};

/**
 * An amount stored in euros, written for the eye in the display currency.
 *
 * Two decimals whatever the currency, because R2 fixes cost at 2dp.
 * `Intl.NumberFormat` with `style: 'currency'` was the obvious first choice and
 * it is wrong here: it uses each currency's own minor units, so some currencies
 * would render three decimals and some none, breaking both the rule and the
 * alignment of the grid's columns. A symbol and `toFixed(2)` do exactly what R2
 * asks and nothing else.
 */
export function formatMoney(amountInEur: number, currency: DisplayCurrency): string {
  return formatMoneyAmount(moneyToDisplay(amountInEur, currency), currency);
}

/**
 * An amount stored in euros, as an exact number in the display currency.
 *
 * Separate from formatting because of R3. A set of cells has to be rounded so
 * that it adds up to its own displayed total, and that rounding has to happen on
 * the numbers the eye will see - which, in a non-euro currency, are these. Round
 * the euros first and convert afterwards and the column stops adding up in every
 * currency but the stored one.
 */
export function moneyToDisplay(amountInEur: number, currency: DisplayCurrency): number {
  return amountInEur * currency.perEur;
}

/** An amount already in the display currency, written for the eye. */
export function formatMoneyAmount(amount: number, currency: DisplayCurrency): string {
  return `${symbolOf(currency.code)}${amount.toFixed(2)}`;
}

/**
 * A number the user typed in the display currency, back in stored euros.
 *
 * The inverse of the conversion inside `formatMoney`, and only that: parsing the
 * string is the caller's job, because the caller is the one that has to report
 * what was wrong with it.
 */
export function moneyToEur(amount: number, currency: DisplayCurrency): number {
  return amount / currency.perEur;
}

/**
 * The session a remote should actually use, given whatever the host passed.
 *
 * A remote is a separately deployed artifact loaded by a host it does not
 * control, so the prop is untrusted input in the same way the runtime config is.
 * An older shell may push nothing, and a newer one may push a currency this
 * build has never heard of. Neither is worth blanking a panel over: fall back to
 * the standalone default, say so once in the console, and render.
 *
 * The narrow parameter type is on purpose - the caller has a `HostSession` from
 * TypeScript's point of view and this checks the parts TypeScript cannot.
 */
export function sessionFromHost(pushed: HostSession | undefined): HostSession {
  if (pushed === undefined) {
    return DEFAULT_SESSION;
  }

  const { code, perEur } = pushed.currency;

  if (!(CURRENCY_CODES as readonly string[]).includes(code)) {
    console.warn(`Host pushed an unknown display currency "${code}"; showing euros instead`);
    return { ...pushed, currency: DEFAULT_SESSION.currency };
  }
  if (!Number.isFinite(perEur) || perEur <= 0) {
    console.warn(
      `Host pushed ${code} at a rate of ${String(perEur)} per euro; showing euros instead`,
    );
    return { ...pushed, currency: DEFAULT_SESSION.currency };
  }

  return pushed;
}

const SYMBOLS: Record<CurrencyCode, string> = {
  EUR: '€',
  USD: '$',
  CHF: 'CHF ',
  GBP: '£',
};

function symbolOf(code: CurrencyCode): string {
  return SYMBOLS[code];
}
