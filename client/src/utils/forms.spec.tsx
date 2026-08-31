import { getDefaultAgentFormValues } from './forms';

describe('getDefaultAgentFormValues', () => {
  it('uses the scalable user workspace by default', () => {
    expect(getDefaultAgentFormValues().stateful_code_environment).toBe('user');
  });

  it('seeds a new agent with the user workspace preference', () => {
    expect(getDefaultAgentFormValues('agent-user').stateful_code_environment).toBe('agent-user');
  });
});
