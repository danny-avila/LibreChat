import { FILTER_PII_STARTER_PATTERNS } from 'librechat-data-provider';
import type { FiltersConfig, MessageFilterPiiConfig } from 'librechat-data-provider';
import { RE2JS } from 're2js';
import type { ContentFieldMap, ContentSource, TextContentFragment } from './types';
import { createConfiguredContentInspector, inspectContent } from './runtime';

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const BLOCK_PATTERN = {
  id: 'org-token',
  label: 'organization token',
  regex: 'ORG-[A-Z]+',
};

const STARTER_PATTERN_CASES = [
  ['sk_prefix', 'sk-project-CONTRACT'],
  ['bearer_header', 'Authorization: Bearer contract-token'],
  ['api_key_header', 'api-key: contract-token'],
] as const;

function fragment<Source extends ContentSource>(
  source: Source,
  field: ContentFieldMap[Source],
  text = 'ORG-SECRET',
): Extract<TextContentFragment, { source: Source }> {
  return {
    id: `${source}.${field}`,
    text,
    path: `/${source}/${field}`,
    source,
    field,
    format: 'plain',
    treatment: 'replaceable',
    provenance: 'user',
  } as Extract<TextContentFragment, { source: Source }>;
}

describe('configured content inspection', () => {
  it('does no work when neither the generic nor legacy filter is configured', () => {
    expect(createConfiguredContentInspector({})).toBeNull();
    expect(inspectContent([fragment('message', 'text')], {})).toBeNull();
  });

  it('selects generic rules by both source and field and returns raw-free metadata', () => {
    const filters: FiltersConfig = {
      prompts: {
        pii: {
          fields: ['instructions'],
          starterPatterns: [],
          customPatterns: [BLOCK_PATTERN],
        },
      },
    };
    const secret = 'ORG-DO-NOT-ECHO';

    const finding = inspectContent(
      [
        fragment('prompt', 'description', secret),
        fragment('message', 'text', secret),
        fragment('prompt', 'instructions', secret),
      ],
      { filters },
    );

    expect(finding).toEqual({
      detectorId: 'pii-pattern',
      ruleId: 'org-token',
      label: 'organization token',
      source: 'prompt',
      field: 'instructions',
      provenance: 'user',
      fragmentId: 'prompt.instructions',
      fragmentPath: '/prompt/instructions',
    });
    expect(JSON.stringify(finding)).not.toContain(secret);
  });

  it('treats an omitted fields list as every field within only that source', () => {
    const filters: FiltersConfig = {
      skills: {
        pii: {
          starterPatterns: [],
          customPatterns: [BLOCK_PATTERN],
        },
      },
    };

    const finding = inspectContent(
      [fragment('message', 'text'), fragment('skill', 'frontmatter')],
      { filters },
    );

    expect(finding).toMatchObject({
      source: 'skill',
      field: 'frontmatter',
    });
  });

  it('keeps all starter patterns enabled when only custom patterns are configured', () => {
    const filters: FiltersConfig = {
      messages: {
        pii: {
          customPatterns: [BLOCK_PATTERN],
        },
      },
    };

    expect(
      inspectContent([fragment('message', 'text', 'sk-proj-DEFAULT-STARTER')], { filters }),
    ).toMatchObject({
      ruleId: 'sk_prefix',
    });
  });

  it.each(STARTER_PATTERN_CASES)('registers the %s starter pattern', (ruleId, text) => {
    const filters: FiltersConfig = {
      messages: {
        pii: {
          starterPatterns: [ruleId],
        },
      },
    };

    expect(inspectContent([fragment('message', 'text', text)], { filters })).toMatchObject({
      ruleId,
    });
  });

  it('keeps the runtime starter catalog aligned with the public schema', () => {
    expect(FILTER_PII_STARTER_PATTERNS).toEqual(STARTER_PATTERN_CASES.map(([ruleId]) => ruleId));
  });

  it('treats an explicit empty starter list with no custom patterns as no text matching', () => {
    const filters: FiltersConfig = {
      messages: {
        pii: {
          starterPatterns: [],
        },
      },
    };

    expect(
      inspectContent([fragment('message', 'text', 'sk-project-EXPLICITLY-DISABLED')], { filters }),
    ).toBeNull();
  });

  it.each([
    {
      name: 'messages',
      filters: { messages: { pii: { customPatterns: [BLOCK_PATTERN] } } },
      content: fragment('message', 'quote'),
    },
    {
      name: 'assembled message context',
      filters: { messages: { pii: { customPatterns: [BLOCK_PATTERN] } } },
      content: fragment('assembled_context', 'assembled_context'),
    },
    {
      name: 'prompts',
      filters: { prompts: { pii: { customPatterns: [BLOCK_PATTERN] } } },
      content: fragment('prompt', 'context'),
    },
    {
      name: 'agent instructions',
      filters: { agentInstructions: { pii: { customPatterns: [BLOCK_PATTERN] } } },
      content: fragment('agent_instruction', 'additional_instructions'),
    },
    {
      name: 'conversation starters',
      filters: { conversationStarters: { pii: { customPatterns: [BLOCK_PATTERN] } } },
      content: fragment('conversation_starter', 'text'),
    },
    {
      name: 'conversation titles',
      filters: { conversationTitles: { pii: { customPatterns: [BLOCK_PATTERN] } } },
      content: fragment('conversation_title', 'title'),
    },
    {
      name: 'feedback',
      filters: { feedback: { pii: { customPatterns: [BLOCK_PATTERN] } } },
      content: fragment('feedback', 'text'),
    },
    {
      name: 'skills',
      filters: { skills: { pii: { customPatterns: [BLOCK_PATTERN] } } },
      content: fragment('skill', 'instructions'),
    },
    {
      name: 'memories',
      filters: { memories: { pii: { customPatterns: [BLOCK_PATTERN] } } },
      content: fragment('memory', 'value'),
    },
    {
      name: 'files',
      filters: { files: { pii: { customPatterns: [BLOCK_PATTERN] } } },
      content: fragment('file', 'transcript'),
    },
    {
      name: 'tool arguments',
      filters: { toolArguments: { pii: { customPatterns: [BLOCK_PATTERN] } } },
      content: fragment('tool_argument', 'arguments'),
    },
    {
      name: 'model parameters',
      filters: { modelParameters: { pii: { customPatterns: [BLOCK_PATTERN] } } },
      content: fragment('model_parameter', 'request_fields'),
    },
    {
      name: 'action metadata',
      filters: { actionMetadata: { pii: { customPatterns: [BLOCK_PATTERN] } } },
      content: fragment('action_metadata', 'authorization_url'),
    },
  ] satisfies readonly {
    name: string;
    filters: FiltersConfig;
    content: TextContentFragment;
  }[])('registers the $name source', ({ filters, content }) => {
    expect(inspectContent([content], { filters })).toMatchObject({
      source: content.source,
      field: content.field,
    });
  });

  it('keeps quote and assembled-context field selections independent', () => {
    const filters: FiltersConfig = {
      messages: {
        pii: {
          fields: ['text'],
          starterPatterns: [],
          customPatterns: [BLOCK_PATTERN],
        },
      },
    };

    expect(
      inspectContent(
        [fragment('message', 'quote'), fragment('assembled_context', 'assembled_context')],
        { filters },
      ),
    ).toBeNull();
    expect(inspectContent([fragment('message', 'text')], { filters })).not.toBeNull();
  });

  it('keeps the legacy message rule active alongside generic source rules', () => {
    const legacyPii: MessageFilterPiiConfig = {};
    const filters: FiltersConfig = {
      prompts: {
        pii: {
          starterPatterns: [],
          customPatterns: [BLOCK_PATTERN],
        },
      },
    };

    expect(
      inspectContent(
        [
          {
            ...fragment('message', 'text', 'sk-proj-LEGACY'),
            id: 'external-message.0.content',
            path: '/0/content',
          },
        ],
        {
          filters,
          legacyPii,
        },
      ),
    ).toMatchObject({
      detectorId: 'legacy-pattern',
      source: 'message',
    });
    expect(
      inspectContent([fragment('prompt', 'instructions')], {
        filters,
        legacyPii,
      }),
    ).toMatchObject({
      detectorId: 'pii-pattern',
      source: 'prompt',
    });
  });

  it.each([
    {
      name: 'external message names before content',
      fragments: [
        {
          ...fragment('message', 'name', 'sk-proj-LEGACY'),
          id: 'external-message.0.name',
        },
        {
          ...fragment('message', 'text', 'sk-proj-LEGACY'),
          id: 'external-message.0.content',
        },
      ],
    },
    {
      name: 'edited content before decision responses',
      fragments: [
        {
          ...fragment('message', 'content_part', 'sk-proj-LEGACY'),
          id: 'chat.edited-content.text',
        },
        {
          ...fragment('message', 'decision_response', 'sk-proj-LEGACY'),
          id: 'chat.decision.0.response',
        },
      ],
    },
  ])('does not let legacy-ineligible $name suppress eligible content', ({ fragments }) => {
    expect(inspectContent(fragments, { legacyPii: {} })).toMatchObject({
      detectorId: 'legacy-pattern',
      ruleId: 'sk_prefix',
    });
  });

  it('memoizes inspectors by config identity and stops reading after the first finding', () => {
    const filters: FiltersConfig = {
      messages: {
        pii: {
          starterPatterns: [],
          customPatterns: [BLOCK_PATTERN],
        },
      },
    };
    const inspector = createConfiguredContentInspector({ filters });
    const readLater = jest.fn();
    function* content(): Generator<TextContentFragment> {
      yield fragment('message', 'text');
      readLater();
      yield fragment('message', 'text', 'ORG-LATER');
    }

    expect(createConfiguredContentInspector({ filters })).toBe(inspector);
    expect(inspector?.inspect(content())).not.toBeNull();
    expect(readLater).not.toHaveBeenCalled();
  });

  it('inspects identical text once per applicable source filter', () => {
    const filters: FiltersConfig = {
      skills: {
        pii: {
          starterPatterns: [],
          customPatterns: [BLOCK_PATTERN],
        },
      },
      files: {
        pii: {
          starterPatterns: [],
          customPatterns: [BLOCK_PATTERN],
        },
      },
    };
    const patternTest = jest.spyOn(RE2JS.prototype, 'test');
    let callCount = 0;

    try {
      expect(
        inspectContent(
          [
            fragment('skill', 'instructions', 'repeated safe text'),
            fragment('skill', 'imported_text', 'repeated safe text'),
            fragment('skill', 'file_text', 'repeated safe text'),
            fragment('file', 'content', 'repeated safe text'),
            fragment('file', 'extracted_text', 'repeated safe text'),
          ],
          { filters },
        ),
      ).toBeNull();
      callCount = patternTest.mock.calls.length;
    } finally {
      patternTest.mockRestore();
    }

    expect(callCount).toBe(2);
  });

  it('evaluates ambiguous custom patterns with the linear-time engine', () => {
    const filters: FiltersConfig = {
      messages: {
        pii: {
          starterPatterns: [],
          customPatterns: [{ id: 'ambiguous', label: 'ambiguous text', regex: '(a|aa)+$' }],
        },
      },
    };

    expect(
      inspectContent([fragment('message', 'text', `${'a'.repeat(100_000)}!`)], { filters }),
    ).toBeNull();
  });
});
