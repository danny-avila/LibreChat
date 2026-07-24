import type { ChatGptMessage, ChatGptContentReference } from '~/import/types';
import { buildCitations } from './citations';

const CITE = '';
const OPEN = '';
const CLOSE = '';

function assistant(references: ChatGptContentReference[]): ChatGptMessage {
  return {
    id: 'm1',
    author: { role: 'assistant', name: null },
    create_time: 1,
    content: { content_type: 'text', parts: [''] },
    metadata: { content_references: references },
  };
}

function webpage(url: string, title: string): ChatGptContentReference {
  return { type: 'webpage', alt: null, url, title, snippet: 'snip', attribution: title };
}

describe('buildCitations when groups align with references', () => {
  it('renumbers a standalone anchor to index the array it builds', () => {
    const result = buildCitations(
      assistant([webpage('https://a.com/x', 'A')]),
      `Stay in Positano.${CITE}turn0search7`,
    );

    expect(result.text).toBe(`Stay in Positano.${CITE}turn0search0`);
    expect(result.citations).toEqual([
      {
        turn: 0,
        data: {
          turn: 0,
          organic: [{ link: 'https://a.com/x', title: 'A', snippet: 'snip', attribution: 'A' }],
        },
      },
    ]);
  });

  it('assigns consecutive indices across multiple groups', () => {
    const result = buildCitations(
      assistant([webpage('https://a.com', 'A'), webpage('https://b.com', 'B')]),
      `One.${CITE}turn0search5 Two.${CITE}turn3news2`,
    );

    expect(result.text).toBe(`One.${CITE}turn0search0 Two.${CITE}turn0search1`);
    expect(result.citations[0].data.organic).toHaveLength(2);
    expect(result.citations[0].data.organic?.[1].link).toBe('https://b.com');
  });

  it('expands a grouped reference into a composite of one anchor per item', () => {
    const grouped: ChatGptContentReference = {
      type: 'grouped_webpages',
      alt: null,
      items: [
        { title: 'A', url: 'https://a.com', snippet: null, attributions: 'A' },
        { title: 'B', url: 'https://b.com', snippet: null, attributions: 'B' },
      ],
    };

    const result = buildCitations(
      assistant([grouped]),
      `Claim.${OPEN}${CITE}turn0search4${CITE}turn0news9${CLOSE}`,
    );

    expect(result.text).toBe(`Claim.${OPEN}${CITE}turn0search0${CITE}turn0search1${CLOSE}`);
    expect(result.citations[0].data.organic).toHaveLength(2);
  });
});

describe('buildCitations when groups do not align', () => {
  it('strips markers and appends a deduped sources section', () => {
    const result = buildCitations(
      assistant([webpage('https://a.com', 'A'), webpage('https://a.com', 'A')]),
      `Only one anchor here.${CITE}turn0search0`,
    );

    expect(result.citations).toEqual([]);
    expect(result.text).toContain('Only one anchor here.');
    expect(result.text).toContain('Sources');
    expect(result.text).toContain('[A](https://a.com)');
    expect(result.text.match(/https:\/\/a\.com/g)).toHaveLength(1);
    expect(result.text).not.toMatch(/[-]/);
  });

  it('leaves no marker behind when there are no usable references at all', () => {
    const result = buildCitations(assistant([]), `Claim.${CITE}turn0search0`);

    expect(result.citations).toEqual([]);
    expect(result.text).toBe('Claim.');
  });
});

describe('buildCitations with no citations', () => {
  it('returns the text untouched', () => {
    const result = buildCitations(assistant([]), 'Plain answer.');
    expect(result).toEqual({ text: 'Plain answer.', citations: [] });
  });

  it('strips stray highlight markers even with no anchors', () => {
    const result = buildCitations(assistant([]), 'Highlighted.');
    expect(result.text).toBe('Highlighted.');
  });
});
