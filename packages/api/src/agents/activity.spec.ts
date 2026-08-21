import { projectSubagentActivity, SUBAGENT_ACTIVITY_LIMITS } from './activity';

describe('durable subagent activity projection', () => {
  it('keeps visible text and tool lifecycle while dropping private metadata and reasoning text', () => {
    const projection = projectSubagentActivity(
      JSON.stringify([
        {
          type: 'ai',
          data: {
            content: [
              { type: 'reasoning', reasoning: 'private chain of thought' },
              { type: 'text', text: 'I will check.' },
            ],
            tool_calls: [{ id: 'call-1', name: 'search', args: { query: 'release' } }],
            response_metadata: { providerRequestId: 'private-request' },
          },
        },
        {
          type: 'tool',
          data: {
            tool_call_id: 'call-1',
            name: 'search',
            content: 'Found it.',
            status: 'success',
            artifact: { secret: 'never expose' },
          },
        },
      ]),
    );

    expect(projection).toEqual({
      activity: [
        { type: 'reasoning' },
        { type: 'writing', text: 'I will check.' },
        {
          type: 'tool',
          toolCallId: 'call-1',
          name: 'search',
          input: '{"query":"release"}',
          output: 'Found it.',
          status: 'completed',
        },
      ],
      truncated: false,
    });
    expect(JSON.stringify(projection)).not.toContain('private chain of thought');
    expect(JSON.stringify(projection)).not.toContain('private-request');
    expect(JSON.stringify(projection)).not.toContain('never expose');
  });

  it('fails closed on invalid input and bounds adversarial activity', () => {
    expect(projectSubagentActivity('{')).toEqual({ activity: [], truncated: true });

    const projection = projectSubagentActivity(
      JSON.stringify(
        Array.from({ length: 500 }, (_, index) => ({
          type: 'ai',
          data: {
            content: '🧵'.repeat(SUBAGENT_ACTIVITY_LIMITS.textBytes),
            tool_calls: [
              {
                id: `call-${index}`,
                name: 'tool',
                args: { value: 'x'.repeat(SUBAGENT_ACTIVITY_LIMITS.toolInputBytes * 2) },
              },
            ],
          },
        })),
      ),
    );

    expect(projection.truncated).toBe(true);
    expect(projection.activity.length).toBeLessThanOrEqual(SUBAGENT_ACTIVITY_LIMITS.items);
    expect(Buffer.byteLength(JSON.stringify(projection.activity), 'utf8')).toBeLessThanOrEqual(
      SUBAGENT_ACTIVITY_LIMITS.bytes,
    );
  });

  it.each([
    ['error', 'failed'],
    ['failed', 'failed'],
    ['cancelled', 'cancelled'],
    ['success', 'completed'],
  ] as const)('maps a %s tool result to the %s public lifecycle', (stored, expected) => {
    const projection = projectSubagentActivity(
      JSON.stringify([
        { type: 'ai', data: { tool_calls: [{ id: 'call', name: 'search', args: {} }] } },
        { type: 'tool', data: { tool_call_id: 'call', name: 'search', status: stored } },
      ]),
    );

    expect(projection.activity[0]).toEqual(expect.objectContaining({ status: expected }));
  });

  it('shows only the selected invocation segment from a replacement transcript', () => {
    const projection = projectSubagentActivity(
      JSON.stringify([
        { type: 'human', data: { content: 'Earlier request.' } },
        { type: 'ai', data: { content: 'Earlier private activity.' } },
        { type: 'human', data: { content: 'Selected request.' } },
        { type: 'ai', data: { content: 'Selected activity.' } },
      ]),
      'replace',
    );

    expect(projection.activity).toEqual([{ type: 'writing', text: 'Selected activity.' }]);
    expect(JSON.stringify(projection)).not.toContain('Earlier private activity.');
    expect(projectSubagentActivity('[{"type":"ai","data":{"content":"old"}}]', 'replace')).toEqual({
      activity: [],
      truncated: true,
    });
  });
});
