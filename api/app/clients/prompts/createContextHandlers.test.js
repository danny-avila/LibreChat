/**
 * Tests for the multimodal-RAG additions to createContextHandlers.
 *
 * We mock axios (rag-api), fs.promises.readFile (page PNGs) and
 * @librechat/api / librechat-data-provider so the module loads without
 * requiring the full monorepo wiring — same pattern as autoEmbed.test.js.
 */

jest.mock('axios');

jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: {
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  }),
  { virtual: true },
);

jest.mock(
  '@librechat/api',
  () => ({
    isEnabled: (v) => {
      if (v === undefined || v === null) return false;
      if (typeof v === 'boolean') return v;
      return String(v).toLowerCase() === 'true';
    },
    generateShortLivedToken: jest.fn().mockReturnValue('test-jwt'),
  }),
  { virtual: true },
);

jest.mock(
  'librechat-data-provider',
  () => ({
    validateVisionModel: jest.fn(),
  }),
  { virtual: true },
);

const axios = require('axios');
const fs = require('fs');
const { validateVisionModel } = require('librechat-data-provider');

const createContextHandlers = require('./createContextHandlers');

const buildReq = (model) => ({
  user: { id: 'user-1' },
  body: { model },
});

const makeFile = (overrides = {}) => ({
  file_id: 'f-1',
  filename: 'flyer.pdf',
  type: 'application/pdf',
  embedded: true,
  ...overrides,
});

describe('createContextHandlers — multimodal-RAG', () => {
  const originalRagUrl = process.env.RAG_API_URL;
  const originalFlag = process.env.RAG_INCLUDE_VISUAL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAG_API_URL = 'http://rag.test';
    delete process.env.RAG_INCLUDE_VISUAL; // default -> treated as 'true' via ?? in prod
    delete process.env.RAG_USE_FULL_CONTEXT;
  });

  afterAll(() => {
    if (originalRagUrl === undefined) {
      delete process.env.RAG_API_URL;
    } else {
      process.env.RAG_API_URL = originalRagUrl;
    }
    if (originalFlag === undefined) {
      delete process.env.RAG_INCLUDE_VISUAL;
    } else {
      process.env.RAG_INCLUDE_VISUAL = originalFlag;
    }
  });

  test('returns undefined when RAG_API_URL is missing', () => {
    delete process.env.RAG_API_URL;
    expect(createContextHandlers(buildReq('gpt-4o'), 'hi')).toBeUndefined();
  });

  test('sends include_visual: true on /query and surfaces visual matches on createContext', async () => {
    validateVisionModel.mockReturnValue(true);

    axios.post.mockResolvedValue({
      data: {
        chunks: [[{ page_content: 'kleingedrucktes' }, 0.88]],
        visual_matches: [
          {
            file_id: 'f-1',
            page_number: 2,
            image_path: '/var/rag-visual/f-1/page-2.png',
            score: 0.73,
          },
        ],
      },
    });

    const handlers = createContextHandlers(buildReq('gpt-4o'), 'Wie sieht Seite 2 aus?');
    await handlers.processFile(makeFile());
    const prompt = await handlers.createContext();

    expect(axios.post).toHaveBeenCalledWith(
      'http://rag.test/query',
      expect.objectContaining({ include_visual: true }),
      expect.any(Object),
    );
    expect(prompt).toContain('kleingedrucktes');
    expect(prompt).not.toContain('Hinweis:'); // vision model — no text-only fallback hint
    expect(handlers.getVisualMatches()).toHaveLength(1);
    expect(handlers.getVisualMatches()[0].page_number).toBe(2);
  });

  test('does not attach image_urls for non-vision models and adds a hint to the prompt', async () => {
    validateVisionModel.mockReturnValue(false);

    axios.post.mockResolvedValue({
      data: {
        chunks: [[{ page_content: 'text' }, 0.5]],
        visual_matches: [
          {
            file_id: 'f-1',
            page_number: 3,
            image_path: '/var/rag-visual/f-1/page-3.png',
            score: 0.61,
          },
        ],
      },
    });

    const handlers = createContextHandlers(buildReq('some-text-only-model'), 'q');
    await handlers.processFile(makeFile());
    const prompt = await handlers.createContext();

    expect(prompt).toContain('Hinweis:');
    expect(prompt).toContain('Seiten 3');

    const urls = await handlers.getVisualImageURLs();
    expect(urls).toEqual([]);
  });

  test('getVisualImageURLs base64-encodes each page PNG for vision models', async () => {
    validateVisionModel.mockReturnValue(true);
    const readSpy = jest
      .spyOn(fs.promises, 'readFile')
      .mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG magic bytes

    axios.post.mockResolvedValue({
      data: {
        chunks: [],
        visual_matches: [
          { file_id: 'f-1', page_number: 1, image_path: '/var/rag-visual/f-1/page-1.png', score: 0.9 },
          { file_id: 'f-1', page_number: 2, image_path: '/var/rag-visual/f-1/page-2.png', score: 0.8 },
        ],
      },
    });

    const handlers = createContextHandlers(buildReq('claude-sonnet-4-6'), 'q');
    await handlers.processFile(makeFile());
    await handlers.createContext();

    const urls = await handlers.getVisualImageURLs();
    expect(urls).toHaveLength(2);
    expect(urls[0]).toEqual({
      type: 'image_url',
      image_url: {
        url: 'data:image/png;base64,iVBORw==',
        detail: 'auto',
      },
    });
    expect(readSpy).toHaveBeenCalledTimes(2);
    readSpy.mockRestore();
  });

  test('skips non-absolute image_paths (defense against compromised sidecar)', async () => {
    validateVisionModel.mockReturnValue(true);
    const readSpy = jest.spyOn(fs.promises, 'readFile');

    axios.post.mockResolvedValue({
      data: {
        chunks: [],
        visual_matches: [
          { file_id: 'f-1', page_number: 1, image_path: '../escape/etc/passwd', score: 0.9 },
        ],
      },
    });

    const handlers = createContextHandlers(buildReq('gpt-4o'), 'q');
    await handlers.processFile(makeFile());
    await handlers.createContext();

    const urls = await handlers.getVisualImageURLs();
    expect(urls).toEqual([]);
    expect(readSpy).not.toHaveBeenCalled();
    readSpy.mockRestore();
  });

  test('tolerates legacy flat-list /query response (no visual_matches key)', async () => {
    validateVisionModel.mockReturnValue(true);
    axios.post.mockResolvedValue({
      data: [[{ page_content: 'legacy content' }, 0.7]],
    });

    const handlers = createContextHandlers(buildReq('gpt-4o'), 'q');
    await handlers.processFile(makeFile());
    const prompt = await handlers.createContext();

    expect(prompt).toContain('legacy content');
    expect(handlers.getVisualMatches()).toEqual([]);
    await expect(handlers.getVisualImageURLs()).resolves.toEqual([]);
  });

  test('multimodalEnabled=false passes include_visual: false and yields no matches', async () => {
    process.env.RAG_INCLUDE_VISUAL = 'false';
    validateVisionModel.mockReturnValue(true);
    axios.post.mockResolvedValue({
      data: [[{ page_content: 'plain text' }, 0.5]],
    });

    const handlers = createContextHandlers(buildReq('gpt-4o'), 'q');
    await handlers.processFile(makeFile());
    await handlers.createContext();

    expect(axios.post).toHaveBeenCalledWith(
      'http://rag.test/query',
      expect.objectContaining({ include_visual: false }),
      expect.any(Object),
    );
    await expect(handlers.getVisualImageURLs()).resolves.toEqual([]);
  });
});
