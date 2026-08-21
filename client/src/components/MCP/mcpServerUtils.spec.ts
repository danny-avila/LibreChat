import type { MCPServerStatus } from 'librechat-data-provider';
import { isMCPServerReadyForAgent } from './mcpServerUtils';

const status = (
  connectionState: MCPServerStatus['connectionState'],
  authorizationState: MCPServerStatus['authorizationState'],
): MCPServerStatus => ({ connectionState, authorizationState, requiresOAuth: false });

describe('isMCPServerReadyForAgent', () => {
  it('treats an authorized idle request-scoped server as ready', () => {
    expect(isMCPServerReadyForAgent(status('disconnected', 'authorized'), true)).toBe(true);
  });

  it('treats an idle request-scoped server without an auth requirement as ready', () => {
    expect(isMCPServerReadyForAgent(status('disconnected', 'not_required'), true)).toBe(true);
  });

  it('keeps request-scoped servers gated while authorization is incomplete or failed', () => {
    expect(isMCPServerReadyForAgent(status('disconnected', 'needs_authorization'), true)).toBe(
      false,
    );
    expect(isMCPServerReadyForAgent(status('error', 'error'), true)).toBe(false);
  });

  it('requires declared custom variables before an on-demand server is ready', () => {
    const missingConfiguration = {
      ...status('disconnected', 'not_required'),
      configurationState: 'needs_configuration' as const,
    };
    const configured = {
      ...missingConfiguration,
      configurationState: 'configured' as const,
    };

    expect(isMCPServerReadyForAgent(missingConfiguration, true, true)).toBe(false);
    expect(isMCPServerReadyForAgent(configured, true, true)).toBe(true);
  });

  it('requires a live connection for servers that are not request-scoped', () => {
    expect(isMCPServerReadyForAgent(status('disconnected', 'not_required'), false)).toBe(false);
    expect(isMCPServerReadyForAgent(status('connected', 'not_required'), false)).toBe(true);
  });
});
