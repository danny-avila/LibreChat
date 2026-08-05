import { getMCPOAuthPollingOutcome, isTerminalMCPOAuthPollingError } from '../polling';

describe('getMCPOAuthPollingOutcome', () => {
  it('treats shared flow completion as terminal success', () => {
    expect(getMCPOAuthPollingOutcome({ status: 'COMPLETED', completed: true, failed: false })).toBe(
      'completed',
    );
  });

  it('treats a retained timeout failure as terminal failure', () => {
    expect(
      getMCPOAuthPollingOutcome({
        status: 'FAILED',
        completed: false,
        failed: true,
        error: 'mcp_oauth flow timed out',
      }),
    ).toBe('failed');
  });

  it('keeps polling a pending flow', () => {
    expect(getMCPOAuthPollingOutcome({ status: 'PENDING', completed: false, failed: false })).toBe(
      'pending',
    );
  });

  it('treats missing and unauthorized flow records as terminal polling errors', () => {
    expect(isTerminalMCPOAuthPollingError({ response: { status: 404 } })).toBe(true);
    expect(isTerminalMCPOAuthPollingError({ response: { status: 403 } })).toBe(true);
    expect(isTerminalMCPOAuthPollingError({ response: { status: 500 } })).toBe(false);
  });
});
