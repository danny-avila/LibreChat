import type { AgentToolOptions } from './types/assistants';
import { removeCodeExecutionCaller } from './agentToolOptions';

describe('removeCodeExecutionCaller', () => {
  it('removes a programmatic-only entry that has no other options', () => {
    expect(
      removeCodeExecutionCaller({
        search: { allowed_callers: ['code_execution'] },
      }),
    ).toEqual({});
  });

  it('preserves direct calling and unrelated options', () => {
    expect(
      removeCodeExecutionCaller({
        search: {
          allowed_callers: ['direct', 'code_execution'],
          defer_loading: true,
        },
      }),
    ).toEqual({
      search: {
        allowed_callers: ['direct'],
        defer_loading: true,
      },
    });
  });

  it('does not mutate its input', () => {
    const input: AgentToolOptions = {
      search: { allowed_callers: ['code_execution'], run_in_background: true },
    };

    removeCodeExecutionCaller(input);

    expect(input.search.allowed_callers).toEqual(['code_execution']);
  });
});
