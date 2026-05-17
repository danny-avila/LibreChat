/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { getBrowserTimezone, getSupportedTimezones } from '../timezones';

const stubDateTimeFormat = (zone: string | undefined) => {
  jest.spyOn(Intl, 'DateTimeFormat').mockImplementation((() => ({
    resolvedOptions: () => ({ timeZone: zone }) as Intl.ResolvedDateTimeFormatOptions,
  })) as unknown as typeof Intl.DateTimeFormat);
};

const stubSupportedValuesOf = (impl: ((input: string) => string[]) | undefined) => {
  const target = Intl as unknown as {
    supportedValuesOf?: (input: string) => string[];
  };
  if (impl === undefined) {
    delete target.supportedValuesOf;
    return;
  }
  target.supportedValuesOf = impl;
};

let originalSupportedValuesOf: ((input: string) => string[]) | undefined;

beforeEach(() => {
  originalSupportedValuesOf = (
    Intl as unknown as { supportedValuesOf?: (input: string) => string[] }
  ).supportedValuesOf;
});

afterEach(() => {
  jest.restoreAllMocks();
  stubSupportedValuesOf(originalSupportedValuesOf);
});

describe('getBrowserTimezone', () => {
  it('returns the runtime-detected zone', () => {
    stubDateTimeFormat('Europe/Berlin');
    expect(getBrowserTimezone()).toBe('Europe/Berlin');
  });

  it('falls back to UTC when the runtime returns no zone', () => {
    stubDateTimeFormat(undefined);
    expect(getBrowserTimezone()).toBe('UTC');
  });

  it('falls back to UTC when Intl.DateTimeFormat throws', () => {
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation((() => {
      throw new Error('boom');
    }) as unknown as typeof Intl.DateTimeFormat);
    expect(getBrowserTimezone()).toBe('UTC');
  });
});

describe('getSupportedTimezones', () => {
  it("hoists the browser's zone to the top of the list", () => {
    stubDateTimeFormat('America/Chicago');
    stubSupportedValuesOf(() => ['UTC', 'America/Chicago', 'Europe/Paris']);

    const zones = getSupportedTimezones();
    expect(zones[0]).toBe('America/Chicago');
    expect(zones).toContain('UTC');
    expect(zones).toContain('Europe/Paris');
    expect(zones.filter((z) => z === 'America/Chicago').length).toBe(1);
  });

  it('prepends the browser zone when it is not in the runtime list', () => {
    stubDateTimeFormat('Etc/UTC');
    stubSupportedValuesOf(() => ['America/Los_Angeles', 'Asia/Tokyo']);

    const zones = getSupportedTimezones();
    expect(zones[0]).toBe('Etc/UTC');
    expect(zones.slice(1)).toEqual(['America/Los_Angeles', 'Asia/Tokyo']);
  });

  it('falls back to the curated common list when supportedValuesOf is unavailable', () => {
    stubDateTimeFormat('Asia/Kolkata');
    stubSupportedValuesOf(undefined);

    const zones = getSupportedTimezones();
    expect(zones[0]).toBe('Asia/Kolkata');
    expect(zones).toContain('UTC');
    expect(zones).toContain('Europe/London');
    expect(zones).toContain('America/New_York');
  });

  it('falls back to the curated common list when supportedValuesOf throws', () => {
    stubDateTimeFormat('Australia/Sydney');
    stubSupportedValuesOf(() => {
      throw new Error('not available');
    });

    const zones = getSupportedTimezones();
    expect(zones[0]).toBe('Australia/Sydney');
    expect(zones.length).toBeGreaterThan(1);
  });
});
