import { isIntegrationConnected, needsIntegrationReconnect } from '../src/types/integrations';

describe('integration status helpers', () => {
  it('treats only connected as usable', () => {
    expect(isIntegrationConnected('connected')).toBe(true);
    expect(isIntegrationConnected('expired')).toBe(false);
    expect(isIntegrationConnected('revoked')).toBe(false);
    expect(isIntegrationConnected('not_connected')).toBe(false);
  });

  it('flags expired and revoked for reconnect', () => {
    expect(needsIntegrationReconnect('expired')).toBe(true);
    expect(needsIntegrationReconnect('revoked')).toBe(true);
    expect(needsIntegrationReconnect('connected')).toBe(false);
    expect(needsIntegrationReconnect('not_connected')).toBe(false);
  });
});
