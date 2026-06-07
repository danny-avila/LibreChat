import type { FlowStateManager } from '~/flow/manager';
import type { MCPOAuthTokens } from './types';
import {
  getReplayablePendingMCPOAuthStart,
  getReplayablePendingMCPOAuthStartFromFlow,
} from './pending';
import { PENDING_STALE_MS } from '~/flow/manager';

const NOW = 1_780_000_000_000;
const AUTH_URL = 'https://auth.example.com/oauth';

type TestFlowManager = Pick<FlowStateManager<MCPOAuthTokens | null>, 'getFlowState'>;

function createPendingFlow(createdAt = NOW - 5_000, authorizationUrl = AUTH_URL) {
  return {
    type: 'mcp_oauth',
    status: 'PENDING' as const,
    createdAt,
    metadata: { authorizationUrl },
  };
}

describe('pending MCP OAuth replay helpers', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds a replayable OAuth start from a fresh pending flow', () => {
    const createdAt = NOW - 15_000;

    expect(getReplayablePendingMCPOAuthStartFromFlow(createPendingFlow(createdAt), NOW)).toEqual({
      authURL: AUTH_URL,
      options: { expiresAt: createdAt + PENDING_STALE_MS },
    });
  });

  it('ignores stale, completed, or URL-less OAuth flows', () => {
    expect(
      getReplayablePendingMCPOAuthStartFromFlow(createPendingFlow(NOW - PENDING_STALE_MS), NOW),
    ).toBeUndefined();
    expect(
      getReplayablePendingMCPOAuthStartFromFlow({
        ...createPendingFlow(),
        status: 'COMPLETED',
      }),
    ).toBeUndefined();
    expect(
      getReplayablePendingMCPOAuthStartFromFlow(createPendingFlow(NOW - 1_000, '')),
    ).toBeUndefined();
  });

  it('loads the generated user/server flow ID before converting the flow', async () => {
    const flow = createPendingFlow();
    const getFlowState = jest.fn().mockResolvedValue(flow);
    const flowManager: TestFlowManager = { getFlowState };

    await expect(
      getReplayablePendingMCPOAuthStart({
        flowManager,
        userId: 'user-123',
        serverName: 'Google-Workspace',
      }),
    ).resolves.toEqual({
      authURL: AUTH_URL,
      options: { expiresAt: flow.createdAt + PENDING_STALE_MS },
    });
    expect(getFlowState).toHaveBeenCalledWith('user-123:Google-Workspace', 'mcp_oauth');
  });

  it('returns undefined when the flow manager cannot be inspected', async () => {
    const getFlowState = jest.fn().mockRejectedValue(new Error('offline'));
    const flowManager: TestFlowManager = { getFlowState };

    await expect(
      getReplayablePendingMCPOAuthStart({
        flowManager,
        userId: 'user-123',
        serverName: 'Google-Workspace',
      }),
    ).resolves.toBeUndefined();
  });
});
