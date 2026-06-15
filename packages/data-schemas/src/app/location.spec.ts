import { loadLocationConfig } from './location';

describe('loadLocationConfig', () => {
  it('defaults to enabled when unset', () => {
    expect(loadLocationConfig(undefined)).toEqual({ enabled: true });
  });

  it('respects an explicit disable', () => {
    expect(loadLocationConfig({ enabled: false })).toEqual({ enabled: false });
  });

  it('passes through a geocoder endpoint', () => {
    const result = loadLocationConfig({
      enabled: true,
      geocoder: { endpoint: 'https://example.com/geo' },
    });
    expect(result.geocoder?.endpoint).toBe('https://example.com/geo');
  });
});
