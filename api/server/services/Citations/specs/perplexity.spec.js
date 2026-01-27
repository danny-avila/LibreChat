const {
  detectPerplexityResponse,
  transformPerplexityCitations,
  injectCitationMarkers,
  extractCitationData,
  processPerplexityResponse,
} = require('../perplexity');

// Unicode citation marker (U+E202)
const CITATION_MARKER = String.fromCharCode(0xe202);

describe('Perplexity Citation Service', () => {
  describe('detectPerplexityResponse', () => {
    it('should return true for perplexity endpoint name', () => {
      expect(detectPerplexityResponse('perplexity', null)).toBe(true);
      expect(detectPerplexityResponse('Perplexity', null)).toBe(true);
      expect(detectPerplexityResponse('PERPLEXITY', null)).toBe(true);
      expect(detectPerplexityResponse('my-perplexity-endpoint', null)).toBe(true);
    });

    it('should return true for perplexity baseURL', () => {
      expect(detectPerplexityResponse(null, 'https://api.perplexity.ai/')).toBe(true);
      expect(detectPerplexityResponse(null, 'https://API.PERPLEXITY.AI/')).toBe(true);
    });

    it('should return false for non-perplexity endpoints', () => {
      expect(detectPerplexityResponse('openai', 'https://api.openai.com/')).toBe(false);
      expect(detectPerplexityResponse('anthropic', null)).toBe(false);
      expect(detectPerplexityResponse(null, 'https://api.anthropic.com/')).toBe(false);
    });

    it('should return false for empty inputs', () => {
      expect(detectPerplexityResponse(null, null)).toBe(false);
      expect(detectPerplexityResponse(undefined, undefined)).toBe(false);
      expect(detectPerplexityResponse('', '')).toBe(false);
    });
  });

  describe('transformPerplexityCitations', () => {
    it('should transform string citations array to organic results', () => {
      const citations = ['https://example.com/article1', 'https://example.com/article2'];

      const result = transformPerplexityCitations(citations, null);

      expect(result.organic).toHaveLength(2);
      expect(result.organic[0]).toMatchObject({
        link: 'https://example.com/article1',
        title: 'Source 1',
        position: 1,
      });
      expect(result.organic[1]).toMatchObject({
        link: 'https://example.com/article2',
        title: 'Source 2',
        position: 2,
      });
    });

    it('should transform search_results objects to organic results', () => {
      const searchResults = [
        {
          url: 'https://example.com/article1',
          title: 'First Article',
          snippet: 'This is a snippet',
          date: '2024-01-15',
        },
        {
          url: 'https://example.com/article2',
          title: 'Second Article',
          snippet: 'Another snippet',
        },
      ];

      const result = transformPerplexityCitations(null, searchResults);

      expect(result.organic).toHaveLength(2);
      expect(result.organic[0]).toMatchObject({
        link: 'https://example.com/article1',
        title: 'First Article',
        snippet: 'This is a snippet',
        date: '2024-01-15',
        position: 1,
      });
      expect(result.organic[1]).toMatchObject({
        link: 'https://example.com/article2',
        title: 'Second Article',
        snippet: 'Another snippet',
        position: 2,
      });
    });

    it('should prefer search_results over citations when both provided', () => {
      const citations = ['https://citation.com'];
      const searchResults = [{ url: 'https://searchresult.com', title: 'Search Result' }];

      const result = transformPerplexityCitations(citations, searchResults);

      expect(result.organic).toHaveLength(1);
      expect(result.organic[0].link).toBe('https://searchresult.com');
    });

    it('should return empty organic array for empty inputs', () => {
      const result = transformPerplexityCitations(null, null);

      expect(result.organic).toEqual([]);
      expect(result.topStories).toEqual([]);
      expect(result.images).toEqual([]);
    });

    it('should handle source objects with link instead of url', () => {
      const searchResults = [{ link: 'https://example.com', title: 'Test' }];

      const result = transformPerplexityCitations(null, searchResults);

      expect(result.organic[0].link).toBe('https://example.com');
    });
  });

  describe('injectCitationMarkers', () => {
    it('should replace [1] style markers with Unicode markers (with leading space)', () => {
      const content = 'This is a fact[1] and another fact[2].';
      const result = injectCitationMarkers(content, 0);

      // Space before marker prevents breaking markdown emphasis parsing
      expect(result).toBe(
        `This is a fact ${CITATION_MARKER}turn0search0 and another fact ${CITATION_MARKER}turn0search1.`,
      );
    });

    it('should use correct turn number', () => {
      const content = 'A fact[1].';
      const result = injectCitationMarkers(content, 5);

      expect(result).toBe(`A fact ${CITATION_MARKER}turn5search0.`);
    });

    it('should handle multiple citations in sequence', () => {
      const content = 'Statement[1][2][3].';
      const result = injectCitationMarkers(content, 0);

      expect(result).toBe(
        `Statement ${CITATION_MARKER}turn0search0 ${CITATION_MARKER}turn0search1 ${CITATION_MARKER}turn0search2.`,
      );
    });

    it('should handle double-digit citation numbers', () => {
      const content = 'Many sources[10][11].';
      const result = injectCitationMarkers(content, 0);

      expect(result).toBe(
        `Many sources ${CITATION_MARKER}turn0search9 ${CITATION_MARKER}turn0search10.`,
      );
    });

    it('should return original content if no citations found', () => {
      const content = 'No citations here.';
      const result = injectCitationMarkers(content, 0);

      expect(result).toBe('No citations here.');
    });

    it('should handle null or undefined content', () => {
      expect(injectCitationMarkers(null, 0)).toBe(null);
      expect(injectCitationMarkers(undefined, 0)).toBe(undefined);
    });

    it('should not replace non-citation brackets', () => {
      const content = 'Array[0] is not a citation but [1] is.';
      const result = injectCitationMarkers(content, 0);

      // [0] becomes turn0search-1 which is invalid, so it stays
      // Actually looking at the code, [0] would become search-1 which is kept as original
      // Let me check... citationIndex = 0 - 1 = -1, which returns match (original)
      expect(result).toContain('[0]');
      expect(result).toContain(` ${CITATION_MARKER}turn0search0`);
    });
  });

  describe('extractCitationData', () => {
    it('should extract citations from metadata', () => {
      const metadata = {
        citations: ['https://example.com'],
        search_results: [{ url: 'https://example.com', title: 'Test' }],
      };

      const result = extractCitationData(metadata, null);

      expect(result.citations).toEqual(['https://example.com']);
      expect(result.search_results).toEqual([{ url: 'https://example.com', title: 'Test' }]);
    });

    it('should extract citations from rawResponse', () => {
      const rawResponse = {
        citations: ['https://raw.com'],
        search_results: [{ url: 'https://raw.com', title: 'Raw' }],
      };

      const result = extractCitationData(null, rawResponse);

      expect(result.citations).toEqual(['https://raw.com']);
      expect(result.search_results).toEqual([{ url: 'https://raw.com', title: 'Raw' }]);
    });

    it('should prefer metadata over rawResponse for same fields', () => {
      const metadata = { citations: ['https://meta.com'] };
      const rawResponse = { citations: ['https://raw.com'] };

      const result = extractCitationData(metadata, rawResponse);

      // metadata is processed after rawResponse, so it wins
      expect(result.citations).toEqual(['https://meta.com']);
    });

    it('should return nulls for empty inputs', () => {
      const result = extractCitationData(null, null);

      expect(result.citations).toBeNull();
      expect(result.search_results).toBeNull();
    });
  });

  describe('processPerplexityResponse', () => {
    it('should process perplexity response with citations', () => {
      const result = processPerplexityResponse({
        completion: 'React is a library[1] for building UIs[2].',
        metadata: {
          citations: ['https://react.dev', 'https://example.com'],
        },
        turnNumber: 0,
        endpoint: 'perplexity',
        baseURL: 'https://api.perplexity.ai/',
      });

      expect(result.processedCompletion).toContain(`${CITATION_MARKER}turn0search0`);
      expect(result.processedCompletion).toContain(`${CITATION_MARKER}turn0search1`);
      expect(result.searchResults.organic).toHaveLength(2);
    });

    it('should return original completion for non-perplexity endpoints', () => {
      const result = processPerplexityResponse({
        completion: 'Some text[1].',
        metadata: { citations: ['https://example.com'] },
        turnNumber: 0,
        endpoint: 'openai',
        baseURL: 'https://api.openai.com/',
      });

      expect(result.processedCompletion).toBe('Some text[1].');
      expect(result.searchResults).toBeNull();
    });

    it('should return original completion when no citations found', () => {
      const result = processPerplexityResponse({
        completion: 'No citations here.',
        metadata: {},
        turnNumber: 0,
        endpoint: 'perplexity',
        baseURL: 'https://api.perplexity.ai/',
      });

      expect(result.processedCompletion).toBe('No citations here.');
      expect(result.searchResults).toBeNull();
    });

    it('should handle array of content parts', () => {
      const result = processPerplexityResponse({
        completion: [
          { type: 'text', text: 'First part[1].' },
          { type: 'text', text: 'Second part[2].' },
          { type: 'image', url: 'https://example.com/image.png' },
        ],
        metadata: {
          citations: ['https://example1.com', 'https://example2.com'],
        },
        turnNumber: 0,
        endpoint: 'perplexity',
        baseURL: 'https://api.perplexity.ai/',
      });

      expect(result.processedCompletion).toHaveLength(3);
      expect(result.processedCompletion[0].text).toContain(`${CITATION_MARKER}turn0search0`);
      expect(result.processedCompletion[1].text).toContain(`${CITATION_MARKER}turn0search1`);
      expect(result.processedCompletion[2]).toEqual({
        type: 'image',
        url: 'https://example.com/image.png',
      });
    });

    it('should use search_results for richer citation data', () => {
      const result = processPerplexityResponse({
        completion: 'A fact[1].',
        metadata: {
          search_results: [
            {
              url: 'https://example.com',
              title: 'Example Article',
              snippet: 'This is a snippet.',
            },
          ],
        },
        turnNumber: 0,
        endpoint: 'perplexity',
        baseURL: 'https://api.perplexity.ai/',
      });

      expect(result.searchResults.organic[0]).toMatchObject({
        link: 'https://example.com',
        title: 'Example Article',
        snippet: 'This is a snippet.',
      });
    });
  });
});
