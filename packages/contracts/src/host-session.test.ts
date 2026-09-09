import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SESSION,
  type DisplayCurrency,
  formatMoney,
  formatMoneyAmount,
  type HostSession,
  moneyToDisplay,
  moneyToEur,
  sessionFromHost,
} from './host-session.ts';

const EUR: DisplayCurrency = { code: 'EUR', perEur: 1 };
const USD: DisplayCurrency = { code: 'USD', perEur: 1.08 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatMoney', () => {
  it('leaves euros alone', () => {
    expect(formatMoney(7880, EUR)).toBe('€7880.00');
  });

  it('converts before rounding, not after', () => {
    // 7880 * 1.08 = 8510.4, not 7880.00 * 1.08 rounded twice.
    expect(formatMoney(7880, USD)).toBe('$8510.40');
  });

  it('shows two decimals in every currency, whatever the currency itself uses', () => {
    // R2 fixes cost at 2dp. Intl's currency style would give a different number
    // of decimals per currency and misalign the grid.
    for (const currency of [EUR, USD, { code: 'CHF', perEur: 0.94 } as const]) {
      expect(formatMoney(1, currency)).toMatch(/\d\.\d{2}$/);
    }
  });
});

describe('moneyToDisplay', () => {
  it('is the conversion formatMoney applies, without the rounding', () => {
    expect(moneyToDisplay(7880, USD)).toBeCloseTo(8510.4, 8);
    expect(formatMoneyAmount(moneyToDisplay(7880, USD), USD)).toBe(formatMoney(7880, USD));
  });

  it('lets a caller round the displayed numbers rather than the stored ones', () => {
    // R3 has to hold in whatever currency is on screen, so a grid converts the
    // whole row first and distributes the rounding afterwards.
    const eurCells = [0.334, 0.333, 0.333];
    const displayed = eurCells.map((cell) => moneyToDisplay(cell, USD));

    expect(displayed.reduce((sum, cell) => sum + cell, 0)).toBeCloseTo(moneyToDisplay(1, USD), 8);
  });
});

describe('moneyToEur', () => {
  it('is the inverse of the conversion in formatMoney', () => {
    const typed = 8510.4;

    expect(moneyToEur(typed, USD)).toBeCloseTo(7880, 8);
  });

  it('is identity in euros, so no rounding is introduced by switching currency', () => {
    expect(moneyToEur(7880, EUR)).toBe(7880);
  });
});

describe('sessionFromHost', () => {
  it('falls back to standalone defaults when the host pushed nothing', () => {
    expect(sessionFromHost(undefined)).toBe(DEFAULT_SESSION);
  });

  it('keeps a valid session as it was pushed', () => {
    const pushed: HostSession = {
      currency: USD,
      user: { employeeId: 'emp-001', name: 'A. Okafor' },
    };

    expect(sessionFromHost(pushed)).toBe(pushed);
  });

  it('shows euros rather than a currency this build does not know', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pushed = {
      currency: { code: 'XYZ', perEur: 2 },
      user: null,
    } as unknown as HostSession;

    expect(sessionFromHost(pushed).currency).toStrictEqual(DEFAULT_SESSION.currency);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('shows euros rather than dividing by a rate of zero', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pushed: HostSession = { currency: { code: 'USD', perEur: 0 }, user: null };

    expect(sessionFromHost(pushed).currency).toStrictEqual(DEFAULT_SESSION.currency);
  });

  it('keeps the active user even when the currency is replaced', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const user = { employeeId: 'emp-002', name: 'L. Haddad' };
    const pushed: HostSession = { currency: { code: 'USD', perEur: -1 }, user };

    expect(sessionFromHost(pushed).user).toBe(user);
  });
});
