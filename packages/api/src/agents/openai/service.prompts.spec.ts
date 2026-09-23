import { applyResponseAppPrompt } from '../appPrompt';

const APP_PROMPT = 'Current prompt fetched from S3.';

describe('applyResponseAppPrompt', () => {
  test('keeps the fetched app prompt exact and retains stored/run context separately', () => {
    const agent = {
      id: 'agent-in-house',
      provider: 'openai',
      instructions: 'Stored agent instructions.',
      additional_instructions: 'Existing run context.',
    };

    const result = applyResponseAppPrompt(agent, APP_PROMPT, 'Case context: matter-42.');

    expect(result.instructions).toBe(APP_PROMPT);
    expect(result.additional_instructions).toBe(
      'Existing run context.\n\nStored agent instructions.\n\nCase context: matter-42.',
    );
    expect(agent.instructions).toBe('Stored agent instructions.');
  });

  test('does not let caller instructions replace the mapped prompt', () => {
    const result = applyResponseAppPrompt(
      { id: 'agent-civil', provider: 'openai', instructions: 'Stored agent instructions.' },
      APP_PROMPT,
      'Caller replacement instructions.',
    );

    expect(result.instructions).toBe(APP_PROMPT);
    expect(result.additional_instructions).toBe('Stored agent instructions.\n\nCaller replacement instructions.');
  });
});
