import { logger } from '@librechat/data-schemas';
import type { MessageFilterPiiConfig } from 'librechat-data-provider';
import type { TextContentFragment } from './types';
import { createLegacyPiiInspector, inspectLegacyPii, toLegacyPiiMatch } from './legacy';
import { extractMessageContent } from './adapters/messages';

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

function fragment(id: string, text: string): TextContentFragment {
  return {
    id,
    text,
    path: `/${id}`,
    source: 'message',
    field: 'text',
    format: 'plain',
    treatment: 'replaceable',
    provenance: 'user',
  };
}

describe('legacy content protection', () => {
  it('returns a raw-free finding and converts it to the public legacy match', () => {
    const secret = 'sk-proj-FAKE1234567890ABCDEF';
    const finding = inspectLegacyPii(
      [fragment('external-message.0.content', `my key is ${secret}`)],
      {},
    );

    expect(finding).toEqual({
      detectorId: 'legacy-pattern',
      ruleId: 'sk_prefix',
      label: 'sk- prefix token',
      source: 'message',
      field: 'text',
      provenance: 'user',
      fragmentId: 'external-message.0.content',
      fragmentPath: '/external-message.0.content',
    });
    expect(JSON.stringify(finding)).not.toContain(secret);
    expect(toLegacyPiiMatch(finding)).toEqual({
      id: 'sk_prefix',
      label: 'sk- prefix token',
    });
  });

  it('preserves candidate-first ordering when different rules match different fields', () => {
    const config: MessageFilterPiiConfig = {
      starterPatterns: [],
      customPatterns: [
        { id: 'first-rule', label: 'A value', regex: 'VALUE-A' },
        { id: 'second-rule', label: 'B value', regex: 'VALUE-B' },
      ],
    };

    const finding = inspectLegacyPii(
      [
        fragment('external-message.0.content', 'VALUE-B'),
        fragment('external-message.1.content', 'VALUE-A'),
      ],
      config,
    );

    expect(finding?.ruleId).toBe('second-rule');
    expect(finding?.fragmentId).toBe('external-message.0.content');
  });

  it('does not read later message content after the first finding', () => {
    const readLaterContent = jest.fn(() => {
      throw new Error('later content should not be read');
    });
    const messages = [
      { content: 'sk-proj-FAKE1234567890ABCDEF' },
      {
        get content() {
          return readLaterContent();
        },
      },
    ];
    const inspector = createLegacyPiiInspector({});

    const finding = inspector?.inspect(extractMessageContent(messages));

    expect(finding?.ruleId).toBe('sk_prefix');
    expect(readLaterContent).not.toHaveBeenCalled();
  });

  it('keeps legacy matching limited to the fields it historically inspected', () => {
    const config: MessageFilterPiiConfig = {};
    const inspector = createLegacyPiiInspector(config);
    const secret = 'sk-proj-FAKE1234567890ABCDEF';

    expect(
      inspector?.inspect([
        {
          ...fragment('external-message.0.name', secret),
          field: 'name',
        },
        {
          ...fragment('external-message.0.part.0.attachment.filename', secret),
          field: 'attachment_reference',
        },
        {
          ...fragment('external-message.0.tool-call.0.arguments', secret),
          source: 'tool_argument',
          field: 'arguments',
        },
      ]),
    ).toBeNull();
    expect(
      inspector?.inspect([
        {
          ...fragment('external-message.0.content', secret),
          field: 'text',
        },
      ]),
    ).not.toBeNull();
  });

  it('compiles once per config identity and warns once for an invalid pattern', () => {
    const config = {
      starterPatterns: [],
      customPatterns: [{ id: 'broken', label: 'Broken', regex: '(' }],
    } as MessageFilterPiiConfig;

    expect(inspectLegacyPii([], config)).toBeNull();
    expect(inspectLegacyPii([], config)).toBeNull();

    expect(createLegacyPiiInspector(config)).toBe(createLegacyPiiInspector(config));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('[messageFilter.pii] dropping invalid customPattern "broken":'),
    );
  });
});
