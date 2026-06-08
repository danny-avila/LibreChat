import { logger } from '@librechat/data-schemas';

import type { MCPOAuthFlowMetadata, MCPOAuthTokens } from './types';
import type { FlowStateManager } from '~/flow/manager';
import type { FlowState } from '~/flow/types';
import type * as t from '~/mcp/types';

import { PENDING_STALE_MS } from '~/flow/manager';
import { MCPOAuthHandler } from './handler';

const MCP_OAUTH_FLOW_TYPE = 'mcp_oauth';

type PendingOAuthFlowState = Pick<
  FlowState<MCPOAuthTokens | null>,
  'createdAt' | 'metadata' | 'status'
>;

type PendingOAuthFlowManager = Pick<FlowStateManager<MCPOAuthTokens | null>, 'getFlowState'>;

export type PendingOAuthStart = {
  authURL: string;
  options?: t.OAuthStartOptions;
};

export type ReplayablePendingMCPOAuthStartOptions = {
  flowManager?: PendingOAuthFlowManager | null;
  userId: string;
  serverName: string;
};

export function getReplayablePendingMCPOAuthStartFromFlow(
  flow: PendingOAuthFlowState | null | undefined,
  now = Date.now(),
): PendingOAuthStart | undefined {
  if (flow?.status !== 'PENDING') {
    return undefined;
  }

  const expiresAt = flow.createdAt + PENDING_STALE_MS;
  if (expiresAt <= now) {
    return undefined;
  }

  const metadata = flow.metadata as Partial<MCPOAuthFlowMetadata>;
  const authorizationUrl = metadata.authorizationUrl;
  if (!authorizationUrl) {
    return undefined;
  }

  return { authURL: authorizationUrl, options: { expiresAt } };
}

export async function getReplayablePendingMCPOAuthStart({
  flowManager,
  userId,
  serverName,
}: ReplayablePendingMCPOAuthStartOptions): Promise<PendingOAuthStart | undefined> {
  if (!flowManager || typeof flowManager.getFlowState !== 'function') {
    return undefined;
  }

  try {
    const flowId = MCPOAuthHandler.generateFlowId(userId, serverName);
    const flowState = await flowManager.getFlowState(flowId, MCP_OAUTH_FLOW_TYPE);
    return getReplayablePendingMCPOAuthStartFromFlow(flowState);
  } catch (error) {
    logger.warn(`[MCP OAuth] Failed to inspect pending flow for ${serverName}:`, error);
    return undefined;
  }
}
