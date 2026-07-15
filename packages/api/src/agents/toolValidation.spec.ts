import { getToolInputValidationDetails } from './toolValidation';

describe('getToolInputValidationDetails', () => {
  test('classifies an overlong ask_user_question option label without returning raw content', () => {
    const details = getToolInputValidationDetails({
      tool_call: {
        name: 'ask_user_question',
        output:
          'Error processing tool: Received tool input did not match expected schema\n' +
          '✖ Option labels must be 120 characters or fewer. Shorten the label and retry.\n' +
          '  → at options[0].label',
      },
    });

    expect(details).toEqual({
      toolName: 'ask_user_question',
      reason: 'option_label_too_long',
      fieldPath: 'options[0].label',
    });
    expect(JSON.stringify(details)).not.toContain('Shorten the label');
  });

  test('classifies other schema failures without requiring a field path', () => {
    expect(
      getToolInputValidationDetails({
        tool_call: {
          name: 'search',
          output: 'Error processing tool: Received tool input did not match expected schema',
        },
      }),
    ).toEqual({ toolName: 'search', reason: 'invalid_tool_input' });
  });

  test('ignores successful tool output', () => {
    expect(
      getToolInputValidationDetails({
        tool_call: { name: 'ask_user_question', output: 'Use CPI data' },
      }),
    ).toBeNull();
  });
});
