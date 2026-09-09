import { readScheduleMCPOutcomes } from 'librechat-data-provider';
import { scheduleMCPErrorMessage } from '../errors';

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

it('restores saved per-server failure outcomes on the schedule card', () => {
  const outcomes = [{ server: 'Notion', status: 'mcp_reauth_required' }];
  expect(readScheduleMCPOutcomes(`mcp_reauth_required: ${JSON.stringify(outcomes)}`)).toEqual(
    outcomes,
  );
});
