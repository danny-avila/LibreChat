import {
  ASK_USER_QUESTION_TOOL_NAME,
  AskUserQuestionToolDefinition,
  askUserQuestionToolSchema,
  createAskUserQuestionTool,
} from './askUserQuestionTool';

/**
 * Contract-shape coverage. The runtime behavior (interrupt from the tool body,
 * durable pause, answer round-trip over the real resume controller) is covered
 * end-to-end in `api/server/controllers/agents/__tests__/askUserQuestion.e2e.spec.js`.
 */
describe('ask_user_question tool contract', () => {
  test('the name matches the SDK interrupt discriminator the pipeline keys on', () => {
    expect(ASK_USER_QUESTION_TOOL_NAME).toBe('ask_user_question');
    expect(AskUserQuestionToolDefinition.name).toBe(ASK_USER_QUESTION_TOOL_NAME);
    expect(createAskUserQuestionTool().name).toBe(ASK_USER_QUESTION_TOOL_NAME);
  });

  describe('zod schema (the wire shape the client card receives)', () => {
    test('accepts a bare question', () => {
      expect(askUserQuestionToolSchema.parse({ question: 'Deploy where?' })).toEqual({
        question: 'Deploy where?',
      });
    });

    test('accepts question + description + options', () => {
      const input = {
        question: 'Deploy where?',
        description: 'Two environments are configured.',
        options: [
          { label: 'Staging', value: 'staging' },
          { label: 'Production', value: 'production' },
        ],
      };
      expect(askUserQuestionToolSchema.parse(input)).toEqual(input);
    });

    test('rejects an empty question', () => {
      expect(askUserQuestionToolSchema.safeParse({ question: '' }).success).toBe(false);
    });

    test('rejects an over-cap question (model-generated text is bounded)', () => {
      expect(askUserQuestionToolSchema.safeParse({ question: 'x'.repeat(2001) }).success).toBe(
        false,
      );
    });

    test('rejects more than 12 options', () => {
      const options = Array.from({ length: 13 }, (_, i) => ({
        label: `opt ${i}`,
        value: `v${i}`,
      }));
      expect(askUserQuestionToolSchema.safeParse({ question: 'pick', options }).success).toBe(
        false,
      );
    });

    test('rejects an option missing label or value', () => {
      expect(
        askUserQuestionToolSchema.safeParse({
          question: 'pick',
          options: [{ label: 'only label' }],
        }).success,
      ).toBe(false);
      expect(
        askUserQuestionToolSchema.safeParse({
          question: 'pick',
          options: [{ label: '', value: 'v' }],
        }).success,
      ).toBe(false);
    });

    test('rejects an overlong option label with guidance and records the real tool call', async () => {
      const validationErrors = new Map();
      await expect(
        createAskUserQuestionTool(validationErrors).invoke({
          id: 'tool-1',
          name: ASK_USER_QUESTION_TOOL_NAME,
          type: 'tool_call',
          args: {
            question: 'How should I get the data?',
            options: [{ label: 'x'.repeat(161), value: 'public-data' }],
          },
        }),
      ).rejects.toThrow(
        'Option labels must be 120 characters or fewer. Shorten the label and retry.',
      );
      expect(validationErrors).toEqual(
        new Map([['tool-1', { fieldPath: 'options[0].label', isLengthLimit: true }]]),
      );
    });

    test('accepts multiSelect as an optional boolean and rejects other types', () => {
      const input = {
        question: 'Which apply?',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
        multiSelect: true,
      };
      expect(askUserQuestionToolSchema.parse(input)).toEqual(input);
      expect(
        askUserQuestionToolSchema.safeParse({ question: 'pick', multiSelect: 'yes' }).success,
      ).toBe(false);
    });
  });

  describe('registry definition (schema-only twin)', () => {
    test('question is required; options items require label + value', () => {
      expect(AskUserQuestionToolDefinition.schema.required).toEqual(['question']);
      expect(AskUserQuestionToolDefinition.schema.properties.options.items.required).toEqual([
        'label',
        'value',
      ]);
    });

    test('multiSelect is declared as an optional boolean in both schemas', () => {
      expect(AskUserQuestionToolDefinition.schema.properties.multiSelect.type).toBe('boolean');
      expect(AskUserQuestionToolDefinition.schema.required).not.toContain('multiSelect');
      expect(AskUserQuestionToolDefinition.description).toContain('multiSelect');
    });

    test('definition caps agree with the zod schema caps', () => {
      const { properties } = AskUserQuestionToolDefinition.schema;
      expect(
        askUserQuestionToolSchema.safeParse({ question: 'x'.repeat(properties.question.maxLength) })
          .success,
      ).toBe(true);
      expect(
        askUserQuestionToolSchema.safeParse({
          question: 'x'.repeat(properties.question.maxLength + 1),
        }).success,
      ).toBe(false);
      const atCap = Array.from({ length: properties.options.maxItems }, (_, i) => ({
        label: `l${i}`,
        value: `v${i}`,
      }));
      expect(
        askUserQuestionToolSchema.safeParse({ question: 'pick', options: atCap }).success,
      ).toBe(true);
      const labelMax = properties.options.items.properties.label.maxLength;
      expect(
        askUserQuestionToolSchema.safeParse({
          question: 'pick',
          options: [{ label: 'x'.repeat(labelMax), value: 'v' }],
        }).success,
      ).toBe(true);
      expect(
        AskUserQuestionToolDefinition.schema.properties.options.items.properties.label.maxLength,
      ).toBe(120);
      expect(
        askUserQuestionToolSchema.safeParse({
          question: 'pick',
          options: [{ label: 'x'.repeat(labelMax + 1), value: 'v' }],
        }).success,
      ).toBe(false);
    });

    test('descriptions match between the instance, the definition, and the constant name', () => {
      const instance = createAskUserQuestionTool();
      expect(instance.description).toBe(AskUserQuestionToolDefinition.description);
      expect(instance.description).toContain('exactly ONE question per turn');
      expect(instance.description).toContain('NEVER call this tool in parallel');
      expect(instance.description).toContain('option label within 120 characters');
      expect(
        AskUserQuestionToolDefinition.schema.properties.options.items.properties.label.description,
      ).toContain('Maximum 120 characters');
    });
  });
});
