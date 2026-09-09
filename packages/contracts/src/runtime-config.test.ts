import { describe, expect, it } from 'vitest';

import { pricingKey } from './contracts.ts';
import { brokenRemotes, readRuntimeConfig, remoteEntryUrl } from './runtime-config.ts';

const CONFIG = { peopleUrl: 'http://localhost:3001', deliveryUrl: 'http://localhost:3002' };

describe('readRuntimeConfig', () => {
  it('reads the two origins', () => {
    expect(readRuntimeConfig(CONFIG)).toStrictEqual(CONFIG);
  });

  it('fails loudly when the file did not run', () => {
    expect(() => readRuntimeConfig(undefined)).toThrow(/config\.js/);
    expect(() => readRuntimeConfig(null)).toThrow(/config\.js/);
  });

  it('fails on a key that is missing or not a string', () => {
    expect(() => readRuntimeConfig({ peopleUrl: 'http://x' })).toThrow(/deliveryUrl/);
    expect(() => readRuntimeConfig({ ...CONFIG, peopleUrl: 3001 })).toThrow(/peopleUrl/);
    expect(() => readRuntimeConfig({ ...CONFIG, peopleUrl: '' })).toThrow(/peopleUrl/);
  });
});

describe('remoteEntryUrl', () => {
  it('points at the configured origin', () => {
    expect(remoteEntryUrl('people', CONFIG, new Set())).toBe(
      'http://localhost:3001/remoteEntry.js',
    );
    expect(remoteEntryUrl('delivery', CONFIG, new Set())).toBe(
      'http://localhost:3002/remoteEntry.js',
    );
  });

  it('tolerates a trailing slash in the configured origin', () => {
    expect(remoteEntryUrl('people', { ...CONFIG, peopleUrl: 'http://x/' }, new Set())).toBe(
      'http://x/remoteEntry.js',
    );
  });

  it('sends a broken remote somewhere unreachable, so the real failure path runs', () => {
    const url = remoteEntryUrl('people', CONFIG, new Set(['people']));

    expect(url).not.toContain('3001');
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:1\//);
  });
});

describe('brokenRemotes', () => {
  it('is empty without the switch', () => {
    expect([...brokenRemotes('')]).toStrictEqual([]);
    expect([...brokenRemotes('?other=1')]).toStrictEqual([]);
  });

  it('reads one name and several', () => {
    expect([...brokenRemotes('?break=people')]).toStrictEqual(['people']);
    expect([...brokenRemotes('?break=people,delivery')].sort()).toStrictEqual([
      'delivery',
      'people',
    ]);
  });

  it('ignores whitespace and names that are not remotes', () => {
    expect([...brokenRemotes('?break= people , nonsense ')]).toStrictEqual(['people']);
  });
});

describe('pricingKey', () => {
  it('composes the key both sides use', () => {
    expect(pricingKey('emp-001', '2026-03')).toBe('emp-001|2026-03');
  });

  it('keeps different pairs apart', () => {
    expect(pricingKey('emp-001', '2026-03')).not.toBe(pricingKey('emp-001', '2026-04'));
    expect(pricingKey('emp-001', '2026-03')).not.toBe(pricingKey('emp-002', '2026-03'));
  });
});
