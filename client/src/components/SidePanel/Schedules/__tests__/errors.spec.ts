import { readScheduleMCPOutcomes } from 'librechat-data-provider';
import {
  scheduleMCPErrorMessage,
  scheduleMCPRecoveryOutcomes,
  scheduleMCPNeedsAgentRecovery,
} from '../errors';

it('shows localized recovery reasons and exact server names', () => {
  const error = Object.assign(new Error('private transport details'), {
    response: {
      data: {
        mcp: [
          { server: 'Notion', status: 'mcp_reauth_required' },
          { server: 'ClickHouse', status: 'ready' },
        ],
      },
    },
  });
  expect(scheduleMCPErrorMessage(error, (key) => key)).toBe('Notion: com_ui_schedule_mcp_reauth');
});

it('ignores unrelated and malformed server errors', () => {
  expect(
    scheduleMCPErrorMessage(new Error('private transport details'), (key) => key),
  ).toBeUndefined();
  expect(readScheduleMCPOutcomes('mcp_reauth_required: [malformed')).toEqual([]);
});

it('explains transient MCP infrastructure failures without server outcomes', () => {
  const error = Object.assign(new Error('private infrastructure details'), {
    response: { status: 503, data: { code: 'mcp_unavailable' } },
  });
  expect(scheduleMCPErrorMessage(error, (key) => key)).toBe('com_ui_schedule_mcp_unavailable');
});

it('explains administrator-revoked MCP permission', () => {
  const error = Object.assign(new Error('permission denied'), {
    response: {
      status: 400,
      data: { mcp: [{ server: 'Notion', status: 'mcp_permission_denied' }] },
    },
  });
  expect(scheduleMCPErrorMessage(error, (key) => key)).toBe(
    'Notion: com_ui_schedule_mcp_permission',
  );
});

it('restores saved per-server failure outcomes on the schedule card', () => {
  const outcomes = [{ server: 'Notion', status: 'mcp_reauth_required' }];
  const lastRun = {
    status: 'error' as const,
    firedAt: new Date().toISOString(),
    error: `mcp_reauth_required: ${JSON.stringify(outcomes)}`,
  };
  expect(
    scheduleMCPRecoveryOutcomes({
      enabled: false,
      disabledReason: 'mcp_reauth_required',
      lastRun,
    }),
  ).toEqual(outcomes);
  expect(
    scheduleMCPRecoveryOutcomes({
      enabled: false,
      disabledReason: 'permission_revoked',
      lastRun,
    }),
  ).toEqual([]);
  expect(scheduleMCPRecoveryOutcomes({ enabled: true, lastRun })).toEqual([]);
});

it('does not label unrelated schedule 503 responses as MCP failures', () => {
  const error = Object.assign(new Error('scheduler unavailable'), {
    response: { status: 503, data: { code: 'SCHEDULES_UNAVAILABLE' } },
  });
  expect(scheduleMCPErrorMessage(error, (key) => key)).toBeUndefined();
});

it('does not offer agent reconnection for permission-only recovery', () => {
  expect(
    scheduleMCPNeedsAgentRecovery([{ server: 'Notion', status: 'mcp_permission_denied' }]),
  ).toBe(false);
  expect(scheduleMCPNeedsAgentRecovery([{ server: 'Notion', status: 'mcp_reauth_required' }])).toBe(
    true,
  );
});
