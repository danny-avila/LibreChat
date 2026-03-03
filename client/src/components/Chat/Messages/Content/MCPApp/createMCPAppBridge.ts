import { MCPAppBridge, type MCPAppBridgeOptions } from './MCPAppBridge';
import { MCPAppBridgeSDKAdapter } from './MCPAppBridgeSDKAdapter';

export type MCPAppBridgeLike = Pick<
  MCPAppBridge,
  'start' | 'destroy' | 'sendResourceToSandbox' | 'sendContextUpdate' | 'teardownResource'
>;

function shouldUseSDKBridge(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const queryParam = new URLSearchParams(window.location.search).get('mcpBridge');
  if (queryParam === 'sdk') {
    return true;
  }

  try {
    return window.localStorage.getItem('librechat.mcp.bridge') === 'sdk';
  } catch {
    return false;
  }
}

export function createMCPAppBridge(options: MCPAppBridgeOptions): MCPAppBridgeLike {
  if (shouldUseSDKBridge()) {
    return new MCPAppBridgeSDKAdapter(options);
  }

  return new MCPAppBridge(options);
}
