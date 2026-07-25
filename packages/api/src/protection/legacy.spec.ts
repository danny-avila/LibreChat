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
    format: 'plain',
    treatment: 'replaceable',
    provenance: 'user',
  };
}

describe('legacy content protection', () => {
  it('returns a raw-free finding and converts it to the public legacy match', () => {
    const secret = 'sk-proj-FAKE1234567890ABCDEF';
    const finding = inspectLegacyPii([fragment('message', `my key is ${secret}`)], {});

    expect(finding).toEqual({
      detectorId: 'legacy-pattern',
      ruleId: 'sk_prefix',
      label: 'sk- prefix token',
      source: 'message',
      provenance: 'user',
      fragmentId: 'message',
      fragmentPath: '/message',
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
      [fragment('first-field', 'VALUE-B'), fragment('second-field', 'VALUE-A')],
      config,
    );

    expect(finding?.ruleId).toBe('second-rule');
    expect(finding?.fragmentId).toBe('first-field');
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
