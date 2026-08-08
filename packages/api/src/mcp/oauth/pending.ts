import { logger, getTenantId } from '@librechat/data-schemas';

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
  now: number = Date.now(),
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
    const flowId = MCPOAuthHandler.generateFlowId(userId, serverName, getTenantId());
    const flowState = await flowManager.getFlowState(flowId, MCP_OAUTH_FLOW_TYPE);
    return getReplayablePendingMCPOAuthStartFromFlow(flowState);
  } catch (error) {
    logger.warn(`[MCP OAuth] Failed to inspect pending flow for ${serverName}:`, error);
    return undefined;
  }
}

export class OAuthPromptRelay {
  private readonly oauthStarts = new Set<t.OAuthStartHandler>();
  private readonly emittedAuthUrls = new WeakMap<t.OAuthStartHandler, string>();
  private lastOAuthStart?: PendingOAuthStart;

  constructor(
    oauthStart: t.OAuthStartHandler | undefined,
    private readonly logPrefix: string,
  ) {
    if (oauthStart) {
      this.oauthStarts.add(oauthStart);
    }
  }

  public readonly start: t.OAuthStartHandler = async (authURL, options) => {
    this.lastOAuthStart = { authURL, options };
    const errors: unknown[] = [];
    let delivered = false;

    for (const oauthStart of Array.from(this.oauthStarts)) {
      try {
        await this.emit(oauthStart, authURL, options);
        delivered = true;
      } catch (error) {
        errors.push(error);
        logger.warn(`${this.logPrefix} Failed to notify OAuth prompt listener`, error);
      }
    }

    if (!delivered && errors.length > 0) {
      throw errors[0];
    }
  };

  public async add({
    oauthStart,
    flowManager,
    userId,
    serverName,
  }: ReplayablePendingMCPOAuthStartOptions & {
    oauthStart?: t.OAuthStartHandler;
  }): Promise<void> {
    if (!oauthStart) {
      return;
    }

    this.oauthStarts.add(oauthStart);
    const lastOAuthStart = this.lastOAuthStart;
    const storedOAuthStart =
      !lastOAuthStart || lastOAuthStart.options?.expiresAt == null
        ? await getReplayablePendingMCPOAuthStart({ flowManager, userId, serverName })
        : undefined;
    const replayOAuthStart =
      storedOAuthStart && (!lastOAuthStart || storedOAuthStart.authURL === lastOAuthStart.authURL)
        ? storedOAuthStart
        : lastOAuthStart;
    if (!replayOAuthStart) {
      return;
    }

    this.lastOAuthStart = replayOAuthStart;
    try {
      await this.emit(oauthStart, replayOAuthStart.authURL, replayOAuthStart.options);
    } catch (error) {
      logger.warn(`${this.logPrefix} Failed to re-issue pending OAuth URL`, error);
    }
  }

  private async emit(
    oauthStart: t.OAuthStartHandler,
    authURL: string,
    options?: t.OAuthStartOptions,
  ): Promise<void> {
    if (this.emittedAuthUrls.get(oauthStart) === authURL) {
      return;
    }
    this.emittedAuthUrls.set(oauthStart, authURL);
    await oauthStart(authURL, options);
  }
}
