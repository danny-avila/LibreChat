import {
  filtersConfigSchema,
  MESSAGE_FILTER_FIELDS,
  PROMPT_FILTER_FIELDS,
  AGENT_INSTRUCTION_FILTER_FIELDS,
  CONVERSATION_STARTER_FILTER_FIELDS,
  CONVERSATION_TITLE_FILTER_FIELDS,
  FEEDBACK_FILTER_FIELDS,
  SKILL_FILTER_FIELDS,
  MEMORY_FILTER_FIELDS,
  FILE_FILTER_FIELDS,
  TOOL_ARGUMENT_FILTER_FIELDS,
  MODEL_PARAMETER_FILTER_FIELDS,
  ACTION_METADATA_FILTER_FIELDS,
  hasActiveFiltersConfig,
  hasActivePiiPatterns,
} from './filters';
import { configSchema, messageFilterPiiSchema } from './config';

describe('filtersConfigSchema', () => {
  it('accepts source-first PII configuration with closed fields', () => {
    const result = filtersConfigSchema.parse({
      messages: { pii: { fields: [...MESSAGE_FILTER_FIELDS] } },
      prompts: { pii: { fields: [...PROMPT_FILTER_FIELDS] } },
      agentInstructions: { pii: { fields: [...AGENT_INSTRUCTION_FILTER_FIELDS] } },
      conversationStarters: {
        pii: { fields: [...CONVERSATION_STARTER_FILTER_FIELDS] },
      },
      conversationTitles: { pii: { fields: [...CONVERSATION_TITLE_FILTER_FIELDS] } },
      feedback: { pii: { fields: [...FEEDBACK_FILTER_FIELDS] } },
      skills: { pii: { fields: [...SKILL_FILTER_FIELDS] } },
      memories: { pii: { fields: [...MEMORY_FILTER_FIELDS] } },
      files: { pii: { fields: [...FILE_FILTER_FIELDS] } },
      toolArguments: { pii: { fields: [...TOOL_ARGUMENT_FILTER_FIELDS] } },
      modelParameters: { pii: { fields: [...MODEL_PARAMETER_FILTER_FIELDS] } },
      actionMetadata: { pii: { fields: [...ACTION_METADATA_FILTER_FIELDS] } },
    });

    expect(result.messages?.pii?.fields).toEqual(MESSAGE_FILTER_FIELDS);
    expect(result.toolArguments?.pii?.fields).toEqual(TOOL_ARGUMENT_FILTER_FIELDS);
    expect(result.modelParameters?.pii?.fields).toEqual(MODEL_PARAMETER_FILTER_FIELDS);
    expect(result.actionMetadata?.pii?.fields).toEqual(ACTION_METADATA_FILTER_FIELDS);
  });

  it('treats source and PII omission as disabled', () => {
    expect(filtersConfigSchema.parse({})).toEqual({});
    expect(filtersConfigSchema.parse({ messages: {} })).toEqual({ messages: {} });
    expect(hasActiveFiltersConfig({})).toBe(false);
    expect(hasActiveFiltersConfig({ messages: {} })).toBe(false);
    expect(hasActivePiiPatterns({ starterPatterns: [] })).toBe(false);
    expect(
      hasActiveFiltersConfig({
        skills: { pii: { fields: ['file_text'], starterPatterns: [] } },
      }),
    ).toBe(false);
  });

  it('keeps default patterns, custom patterns, and explicit file fail-close active', () => {
    expect(hasActivePiiPatterns({})).toBe(true);
    expect(
      hasActivePiiPatterns({
        starterPatterns: [],
        customPatterns: [{ id: 'custom', label: 'custom', regex: 'CUSTOM' }],
      }),
    ).toBe(true);
    expect(
      hasActiveFiltersConfig({
        files: {
          pii: {
            fields: ['content'],
            starterPatterns: [],
            uninspectable: 'block',
          },
        },
      }),
    ).toBe(true);
    expect(
      hasActiveFiltersConfig({
        files: {
          pii: {
            fields: ['name'],
            starterPatterns: [],
            uninspectable: 'block',
          },
        },
      }),
    ).toBe(false);
  });

  it('accepts user-submitted agent categories and message names as explicit fields', () => {
    expect(
      filtersConfigSchema.parse({
        messages: { pii: { fields: ['name'] } },
        agentInstructions: { pii: { fields: ['category'] } },
      }),
    ).toEqual({
      messages: { pii: { fields: ['name'] } },
      agentInstructions: { pii: { fields: ['category'] } },
    });
  });

  it('preserves legacy-shaped starter and custom patterns', () => {
    const result = filtersConfigSchema.parse({
      skills: {
        pii: {
          starterPatterns: ['sk_prefix'],
          customPatterns: [
            {
              id: 'example',
              label: 'Example value',
              regex: 'EXAMPLE-[A-Z0-9]+',
            },
          ],
        },
      },
    });

    expect(result.skills?.pii?.starterPatterns).toEqual(['sk_prefix']);
    expect(result.skills?.pii?.customPatterns).toEqual([
      {
        id: 'example',
        label: 'Example value',
        regex: 'EXAMPLE-[A-Z0-9]+',
      },
    ]);
  });

  it('supports explicit fail-closed handling for opaque file content', () => {
    expect(
      filtersConfigSchema.parse({
        files: {
          pii: {
            fields: ['content'],
            uninspectable: 'block',
          },
        },
      }),
    ).toEqual({
      files: {
        pii: {
          fields: ['content'],
          uninspectable: 'block',
        },
      },
    });
  });

  it('rejects unknown sources, filter types, fields, and nested keys', () => {
    expect(filtersConfigSchema.safeParse({ titles: { pii: {} } }).success).toBe(false);
    expect(filtersConfigSchema.safeParse({ messages: { credentials: {} } }).success).toBe(false);
    expect(
      filtersConfigSchema.safeParse({ messages: { pii: { fields: ['instructions'] } } }).success,
    ).toBe(false);
    expect(
      filtersConfigSchema.safeParse({ messages: { pii: { fields: ['text'], enabled: true } } })
        .success,
    ).toBe(false);
    expect(
      filtersConfigSchema.safeParse({
        messages: { pii: { starterPatterns: ['misspelled_pattern'] } },
      }).success,
    ).toBe(false);
    expect(
      filtersConfigSchema.safeParse({
        files: { pii: { uninspectable: 'quarantine' } },
      }).success,
    ).toBe(false);
  });

  it('rejects empty field selections and patterns outside the bounded linear-time syntax', () => {
    expect(filtersConfigSchema.safeParse({ messages: { pii: { fields: [] } } }).success).toBe(
      false,
    );
    expect(
      filtersConfigSchema.safeParse({
        messages: {
          pii: {
            customPatterns: [{ id: 'broken', label: 'Broken', regex: '(' }],
          },
        },
      }).success,
    ).toBe(false);
    expect(
      filtersConfigSchema.safeParse({
        messages: {
          pii: {
            customPatterns: [
              { id: 'strict', label: 'Strict', regex: 'STRICT-[0-9]+', extra: true },
            ],
          },
        },
      }).success,
    ).toBe(false);
    expect(
      filtersConfigSchema.safeParse({
        messages: {
          pii: {
            customPatterns: [{ id: 'lookahead', label: 'Unsupported', regex: '(?=unsafe)' }],
          },
        },
      }).success,
    ).toBe(false);
    expect(
      filtersConfigSchema.safeParse({
        messages: {
          pii: {
            customPatterns: [{ id: 'too-long', label: 'Too long', regex: 'a'.repeat(513) }],
          },
        },
      }).success,
    ).toBe(false);
  });

  it('integrates with the root config while preserving messageFilter compatibility', () => {
    const parsed = configSchema.parse({
      version: '1.2.1',
      filters: {
        prompts: {
          pii: {
            fields: ['text'],
          },
        },
      },
      messageFilter: {
        pii: {
          starterPatterns: ['sk_prefix'],
        },
      },
    });

    expect(parsed.filters?.prompts?.pii?.fields).toEqual(['text']);
    expect(parsed.messageFilter?.pii?.starterPatterns).toEqual(['sk_prefix']);
    expect(
      messageFilterPiiSchema.parse({ starterPatterns: ['legacy-unknown'] }).starterPatterns,
    ).toEqual(['legacy-unknown']);
    expect(
      messageFilterPiiSchema.safeParse({
        customPatterns: [{ id: 'legacy-redos', label: 'Unsafe', regex: '(a+)+$' }],
      }).success,
    ).toBe(true);
    expect(
      messageFilterPiiSchema.safeParse({
        customPatterns: [{ id: 'legacy-broken', label: 'Broken', regex: '(' }],
      }).success,
    ).toBe(false);
    expect(
      messageFilterPiiSchema.safeParse({
        customPatterns: [{ id: 'legacy-lookahead', label: 'Lookahead', regex: '(?=LEGACY)LEGACY' }],
      }).success,
    ).toBe(true);
    expect(
      messageFilterPiiSchema.safeParse({
        customPatterns: [
          { id: 'legacy-backreference', label: 'Backreference', regex: '(LEGACY)-\\1' },
        ],
      }).success,
    ).toBe(true);
    expect(
      messageFilterPiiSchema.parse({
        customPatterns: [{ id: 'legacy', label: 'Legacy', regex: 'LEGACY-[0-9]+', ignored: true }],
      }),
    ).toEqual({
      customPatterns: [{ id: 'legacy', label: 'Legacy', regex: 'LEGACY-[0-9]+' }],
    });
  });
});
