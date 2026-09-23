import { RESPONSE_PROMPTS_BY_APP_ID } from '../generatedResponsePrompts';
import { applyResponseAppPrompt } from '../appPrompt';

describe('applyResponseAppPrompt', () => {
  test('keeps the mapped app prompt primary and retains run context separately', () => {
    const appPrompt = RESPONSE_PROMPTS_BY_APP_ID['5'].instructions;
    const agent = {
      id: 'agent-in-house',
      provider: 'openai',
      instructions: 'Stored agent instructions.',
      additional_instructions: 'Existing run context.',
    };

    const result = applyResponseAppPrompt(
      agent,
      5,
      `${appPrompt}\n\nCase context: matter-42.`,
    );

    expect(result.instructions).toBe(`${appPrompt}\n\nStored agent instructions.`);
    expect(result.additional_instructions).toBe(
      'Existing run context.\n\nCase context: matter-42.',
    );
    expect(agent.instructions).toBe('Stored agent instructions.');
  });

  test('does not let caller instructions replace the mapped prompt', () => {
    const appPrompt = RESPONSE_PROMPTS_BY_APP_ID['2'].instructions;
    const result = applyResponseAppPrompt(
      { id: 'agent-civil', provider: 'openai', instructions: 'Stored agent instructions.' },
      '2',
      'Caller replacement instructions.',
    );

    expect(result.instructions).toBe(`${appPrompt}\n\nStored agent instructions.`);
    expect(result.additional_instructions).toBe('Caller replacement instructions.');
  });
});
