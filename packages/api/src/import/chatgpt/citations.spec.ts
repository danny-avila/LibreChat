import type { ChatGptMessage } from '~/import/types';
import { buildCitations } from './citations';

const CITE = '';

function assistant(metadata: ChatGptMessage['metadata']): ChatGptMessage {
  return {
    id: 'm1',
    author: { role: 'assistant', name: null },
    create_time: 1,
    content: { content_type: 'text', parts: [''] },
    metadata,
  };
}

describe('buildCitations', () => {
  it('flattens search groups into organic results for the cited turn', () => {
    const result = buildCitations(
      assistant({
        search_result_groups: [
          {
            domain: 'earthtrekkers.com',
            entries: [
              {
                title: 'Amalfi Coast Itinerary',
                url: 'https://earthtrekkers.com/amalfi',
                snippet: 'Plan your trip',
                attributions: null,
              },
            ],
          },
        ],
      }),
      `Great trip.${CITE}turn0search0`,
    );

    expect(result).toEqual([
      {
        turn: 0,
        data: {
          turn: 0,
          organic: [
            {
              link: 'https://earthtrekkers.com/amalfi',
              title: 'Amalfi Coast Itinerary',
              snippet: 'Plan your trip',
              attribution: 'earthtrekkers.com',
            },
          ],
        },
      },
    ]);
  });

  it('routes news anchors to topStories', () => {
    const [result] = buildCitations(
      assistant({
        content_references: [
          {
            type: 'webpage',
            alt: null,
            url: 'https://ansa.it/x',
            title: 'ANSA piece',
            snippet: 'snippet',
            attribution: 'ANSA',
          },
        ],
      }),
      `Reported today.${CITE}turn0news0`,
    );

    expect(result.data.topStories).toEqual([
      {
        link: 'https://ansa.it/x',
        title: 'ANSA piece',
        snippet: 'snippet',
        attribution: 'ANSA',
      },
    ]);
  });

  it('emits one attachment per referenced turn', () => {
    const result = buildCitations(
      assistant({
        search_result_groups: [
          {
            domain: 'a.com',
            entries: [{ title: 'A', url: 'https://a.com', snippet: null, attributions: null }],
          },
        ],
      }),
      `One${CITE}turn0search0 two${CITE}turn3search0`,
    );

    expect(result.map((entry) => entry.turn)).toEqual([0, 3]);
  });

  it('returns nothing when the text has no anchors', () => {
    const result = buildCitations(
      assistant({
        search_result_groups: [
          {
            domain: 'a.com',
            entries: [{ title: 'A', url: 'https://a.com', snippet: null, attributions: null }],
          },
        ],
      }),
      'Plain answer with no citations.',
    );
    expect(result).toEqual([]);
  });

  it('returns nothing when there are anchors but no sources', () => {
    expect(buildCitations(assistant({}), `Claim.${CITE}turn0search0`)).toEqual([]);
  });

  it('maps file anchors to references', () => {
    const [result] = buildCitations(
      assistant({
        content_references: [
          { type: 'file', alt: null, id: 'file-abc', name: 'GPTs RE 2.2.docx', snippet: 'body' },
        ],
      }),
      `From the doc.${CITE}turn0file0`,
    );

    expect(result.data.references).toEqual([
      {
        link: '#file-file-abc',
        title: 'GPTs RE 2.2.docx',
        attribution: 'GPTs RE 2.2.docx',
        snippet: 'body',
        type: 'file',
      },
    ]);
  });
});
