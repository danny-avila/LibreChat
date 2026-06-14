import { formatLocationToolResult } from './location';

describe('formatLocationToolResult', () => {
  it('reports a disabled message when the feature is off', () => {
    const result = formatLocationToolResult(
      { enabled: true, place: 'Paris' },
      { featureEnabled: false },
    );
    expect(result).toMatch(/disabled/i);
  });

  it('reports not-shared when the user has not opted in', () => {
    const result = formatLocationToolResult(undefined, { featureEnabled: true });
    expect(result).toMatch(/has not shared/i);
  });

  it('reports not-shared when enabled is false', () => {
    const result = formatLocationToolResult({ enabled: false }, { featureEnabled: true });
    expect(result).toMatch(/has not shared/i);
  });

  it('prefers the manual override as the place', () => {
    const result = formatLocationToolResult(
      { enabled: true, source: 'manual', manual: 'Tokyo, Japan', place: 'ignored' },
      { featureEnabled: true },
    );
    expect(result).toContain('Tokyo, Japan');
    expect(result).not.toContain('ignored');
  });

  it('includes place, coordinates, and timezone for device location', () => {
    const result = formatLocationToolResult(
      {
        enabled: true,
        source: 'auto',
        place: 'Paris, Île-de-France, France',
        coordinates: { latitude: 48.85, longitude: 2.35 },
        timezone: 'Europe/Paris',
      },
      { featureEnabled: true },
    );
    expect(result).toContain('Paris, Île-de-France, France');
    expect(result).toContain('48.85');
    expect(result).toContain('2.35');
    expect(result).toContain('Europe/Paris');
  });
});
