const { Tools } = require('librechat-data-provider');

jest.mock('nanoid', () => ({ nanoid: jest.fn(() => 'mock-id') }));
jest.mock('@librechat/api', () => ({ sendEvent: jest.fn() }));
jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  getMessageId: jest.fn(),
  ToolEndHandler: jest.fn(),
  handleToolCalls: jest.fn(),
}));
jest.mock('~/server/services/Files/Citations', () => ({ processFileCitations: jest.fn() }));
jest.mock('~/server/services/Files/Code/process', () => ({
  processCodeOutput: jest.fn(),
  runPreviewFinalize: jest.fn(),
}));
jest.mock('~/server/services/Tools/credentials', () => ({ loadAuthValues: jest.fn() }));
jest.mock('~/server/services/Files/process', () => ({ saveBase64Image: jest.fn() }));

const { collectCitationReferences, emitCitationAnnotations } = require('../callbacks');

describe('collectCitationReferences', () => {
  it('extracts nested url_citation annotations from additional_kwargs', () => {
    const output = {
      additional_kwargs: {
        annotations: [
          {
            type: 'url_citation',
            url_citation: { url: 'https://a.com/x', title: 'A' },
          },
          {
            type: 'url_citation',
            url_citation: { url: 'https://b.com/y', title: 'B' },
          },
        ],
      },
    };

    expect(collectCitationReferences(output)).toEqual([
      { link: 'https://a.com/x', type: 'link', title: 'A' },
      { link: 'https://b.com/y', type: 'link', title: 'B' },
    ]);
  });

  it('extracts flat url_citation annotations', () => {
    const output = {
      additional_kwargs: {
        annotations: [{ type: 'url_citation', url: 'https://c.com', title: 'C' }],
      },
    };

    expect(collectCitationReferences(output)).toEqual([
      { link: 'https://c.com', type: 'link', title: 'C' },
    ]);
  });

  it('reads annotations from response_metadata', () => {
    const output = {
      response_metadata: {
        annotations: [{ type: 'url_citation', url_citation: { url: 'https://d.com' } }],
      },
    };

    expect(collectCitationReferences(output)).toEqual([
      { link: 'https://d.com', type: 'link', title: 'https://d.com' },
    ]);
  });

  it('reads annotations from content-array blocks', () => {
    const output = {
      content: [
        { type: 'text', text: 'hi', annotations: [{ type: 'url_citation', url: 'https://e.com' }] },
      ],
    };

    expect(collectCitationReferences(output)).toEqual([
      { link: 'https://e.com', type: 'link', title: 'https://e.com' },
    ]);
  });

  it('merges and dedupes by URL across all locations', () => {
    const output = {
      additional_kwargs: {
        annotations: [{ type: 'url_citation', url: 'https://dup.com', title: 'first' }],
      },
      response_metadata: {
        annotations: [{ type: 'url_citation', url: 'https://dup.com', title: 'second' }],
      },
    };

    const refs = collectCitationReferences(output);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ link: 'https://dup.com', type: 'link', title: 'first' });
  });

  it('ignores non-url_citation annotations and entries without a URL', () => {
    const output = {
      additional_kwargs: {
        annotations: [
          { type: 'file_citation', file_id: 'abc' },
          { type: 'url_citation', url_citation: { title: 'no url' } },
        ],
      },
    };

    expect(collectCitationReferences(output)).toEqual([]);
  });

  it('returns an empty array for messages without annotations', () => {
    expect(collectCitationReferences({ additional_kwargs: {}, content: 'plain text' })).toEqual([]);
    expect(collectCitationReferences(null)).toEqual([]);
    expect(collectCitationReferences(undefined)).toEqual([]);
  });
});

describe('emitCitationAnnotations', () => {
  const makeRes = () => ({ headersSent: true, writableEnded: false, write: jest.fn() });

  it('writes a web_search attachment and pushes it for persistence', () => {
    const res = makeRes();
    const artifactPromises = [];
    const data = {
      output: {
        additional_kwargs: {
          annotations: [{ type: 'url_citation', url_citation: { url: 'https://a.com', title: 'A' } }],
        },
      },
    };

    emitCitationAnnotations(res, null, data, 'msg-1', artifactPromises);

    expect(res.write).toHaveBeenCalledTimes(1);
    const written = res.write.mock.calls[0][0];
    expect(written).toContain('event: attachment');
    expect(written).toContain(Tools.web_search);
    expect(written).toContain('https://a.com');
    expect(artifactPromises).toHaveLength(1);
  });

  it('does nothing when there are no citations', () => {
    const res = makeRes();
    const artifactPromises = [];

    emitCitationAnnotations(res, null, { output: { content: 'no citations' } }, 'msg-1', artifactPromises);

    expect(res.write).not.toHaveBeenCalled();
    expect(artifactPromises).toHaveLength(0);
  });

  it('associates the attachment with the provided messageId', async () => {
    const res = makeRes();
    const artifactPromises = [];
    const data = {
      output: { additional_kwargs: { annotations: [{ type: 'url_citation', url: 'https://a.com' }] } },
    };

    emitCitationAnnotations(res, null, data, 'msg-42', artifactPromises);

    const attachment = await artifactPromises[0];
    expect(attachment.messageId).toBe('msg-42');
    expect(attachment.type).toBe(Tools.web_search);
    expect(attachment[Tools.web_search].references).toEqual([
      { link: 'https://a.com', type: 'link', title: 'https://a.com' },
    ]);
  });
});
