import axios from 'axios';
import http from 'node:http';
import https from 'node:https';
import type { StructuredToolInterface } from '@librechat/agents/langchain/tools';
import type { ToolMessage } from '@langchain/core/messages';
import type { AxiosInstance } from 'axios';
import type {
  AnysearchOrganicResult,
  AnysearchToolArtifact,
  AnysearchToolParams,
} from './anysearch';
import {
  ANYSEARCH_CLIENT_HEADER,
  ANYSEARCH_DEFAULT_API_URL,
  clearAnysearchSubDomainCache,
  createAnysearchSearchTool,
  formatAnysearchResultsForLLM,
  parseBatchMarkdown,
  parseExtractResponse,
  parseSearchMarkdown,
} from './anysearch';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockPost = jest.fn();

const SAMPLE_SEARCH_TEXT = [
  '## Search Results (2 results, 42ms)',
  '### 1. Apple Inc. (AAPL) Stock Price',
  '- **URL**: https://finance.yahoo.com/quote/AAPL',
  '- Symbol: AAPL | Name: Apple Inc. | Price: 229.00',
  '### 2. AAPL - Apple Stock Quote',
  '- **URL**: https://www.marketwatch.com/investing/stock/aapl',
  '- Apple Inc. historical stock prices.',
].join('\n');

const SAMPLE_BATCH_TEXT = [
  '## Query 1: AAPL',
  '## Search Results (1 result, 10ms)',
  '### 1. Apple Inc. (AAPL) Stock Price',
  '- **URL**: https://finance.yahoo.com/quote/AAPL',
  '- Symbol: AAPL | Price: 229.00',
  '## Query 2: MSFT',
  '## Search Results (2 results, 12ms)',
  '### 1. Apple Inc. (AAPL) Stock Price',
  '- **URL**: https://finance.yahoo.com/quote/AAPL',
  '- Symbol: AAPL | Price: 229.00',
  '### 2. Microsoft Corporation (MSFT) Stock',
  '- **URL**: https://finance.yahoo.com/quote/MSFT',
  '- Symbol: MSFT | Price: 508.00',
].join('\n');

const SAMPLE_DIRECTORY_TEXT = [
  '## finance Domain Capabilities (2 available)',
  '### finance.quote',
  'Real-time stock quote.',
  '**Parameters:**',
  '- `type` (required): stock or index.',
  '- `symbol` (required): ticker symbol.',
  '- `cn_code` (required): Chinese market code.',
].join('\n');
function jsonRpcResponse(text: string) {
  return {
    data: {
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text }] },
    },
  };
}

function toolCallConfig(params: AnysearchToolParams, turn?: number) {
  return {
    toolCall: {
      id: 'call-1',
      name: 'web_search',
      args: params,
      ...(turn != null && { turn }),
    },
  };
}

async function invokeTool(
  tool: StructuredToolInterface,
  params: AnysearchToolParams,
  turn?: number,
): Promise<ToolMessage> {
  return (await tool.invoke(params, toolCallConfig(params, turn))) as ToolMessage;
}

type AnysearchToolFunc = (
  input: AnysearchToolParams,
  runManager?: unknown,
  config?: unknown,
) => Promise<[string, AnysearchToolArtifact]>;

/**
 * Calls the tool's inner func directly, bypassing the framework's schema
 * validation, to exercise the handler's own runtime validation.
 */
async function invokeToolFunc(
  tool: StructuredToolInterface,
  params: AnysearchToolParams,
): Promise<[string, AnysearchToolArtifact]> {
  const func = (tool as { func: AnysearchToolFunc }).func;
  return func(params);
}

function artifactOf(message: ToolMessage): AnysearchToolArtifact {
  return message.artifact as AnysearchToolArtifact;
}

describe('AnySearch parsers', () => {
  describe('parseSearchMarkdown', () => {
    it('parses result blocks with title, URL, and snippet lines', () => {
      const results = parseSearchMarkdown(SAMPLE_SEARCH_TEXT);
      expect(results).toEqual([
        {
          title: 'Apple Inc. (AAPL) Stock Price',
          link: 'https://finance.yahoo.com/quote/AAPL',
          snippet: '- Symbol: AAPL | Name: Apple Inc. | Price: 229.00',
        },
        {
          title: 'AAPL - Apple Stock Quote',
          link: 'https://www.marketwatch.com/investing/stock/aapl',
          snippet: '- Apple Inc. historical stock prices.',
        },
      ]);
    });

    it('returns an empty array for empty or zero-result input', () => {
      expect(parseSearchMarkdown('')).toEqual([]);
      expect(parseSearchMarkdown('## Search Results (0 results, 5ms)')).toEqual([]);
    });
  });

  describe('parseBatchMarkdown', () => {
    it('merges query sections and dedupes by link (first occurrence wins)', () => {
      const results = parseBatchMarkdown(SAMPLE_BATCH_TEXT);
      expect(results.map((r) => r.link)).toEqual([
        'https://finance.yahoo.com/quote/AAPL',
        'https://finance.yahoo.com/quote/MSFT',
      ]);
      expect(results[1]).toEqual({
        title: 'Microsoft Corporation (MSFT) Stock',
        link: 'https://finance.yahoo.com/quote/MSFT',
        snippet: '- Symbol: MSFT | Price: 508.00',
      });
    });

    it('returns an empty array for empty input', () => {
      expect(parseBatchMarkdown('')).toEqual([]);
    });
  });

  describe('parseExtractResponse', () => {
    it('parses the JSON extract payload', () => {
      const payload = JSON.stringify({
        url: 'https://example.com',
        title: 'Example Domain',
        content: '# Example Domain\n\nThis domain is for use in examples.',
      });
      expect(parseExtractResponse(payload)).toEqual({
        title: 'Example Domain',
        content: '# Example Domain\n\nThis domain is for use in examples.',
      });
    });

    it('falls back to the raw text when the payload is not JSON', () => {
      expect(parseExtractResponse('# Just Markdown')).toEqual({ content: '# Just Markdown' });
      expect(parseExtractResponse('{"no_content": true}')).toEqual({
        content: '{"no_content": true}',
      });
    });
  });
});

interface CreatedClientConfig {
  baseURL?: string;
  timeout?: number;
  headers: Record<string, string | undefined>;
  httpAgent?: http.Agent;
  httpsAgent?: https.Agent;
}

function createdClientConfig(): CreatedClientConfig {
  const call = mockedAxios.create.mock.calls[0];
  expect(call).toBeDefined();
  const config: unknown = call?.[0];
  return config as CreatedClientConfig;
}

describe('formatAnysearchResultsForLLM', () => {
  const organic: AnysearchOrganicResult[] = [
    { title: 'Apple Inc.', link: 'https://a.example', snippet: 'AAPL quote' },
    { title: 'MarketWatch', link: 'https://m.example', snippet: 'AAPL history' },
  ];

  it('produces the SDK citation-anchor format and references', () => {
    const { output, references } = formatAnysearchResultsForLLM(0, organic);
    expect(output).toContain('=== Web Results, Turn 0 ===');
    expect(output).toContain('# Search 0: "Apple Inc."');
    expect(output).toContain('Anchor: \\ue202turn0search0');
    expect(output).toContain('Anchor: \\ue202turn0search1');
    expect(output).toContain('URL: https://a.example');
    expect(output).toContain('Summary: AAPL quote');
    expect(references).toEqual([
      { link: 'https://a.example', type: 'link', title: 'Apple Inc.' },
      { link: 'https://m.example', type: 'link', title: 'MarketWatch' },
    ]);
  });

  it('stamps the turn into section headers and anchors', () => {
    const { output } = formatAnysearchResultsForLLM(3, organic.slice(0, 1));
    expect(output).toContain('=== Web Results, Turn 3 ===');
    expect(output).toContain('Anchor: \\ue202turn3search0');
  });

  it('truncates the output to the configured character budget', () => {
    const { output } = formatAnysearchResultsForLLM(0, organic, 50);
    expect(output.length).toBeLessThanOrEqual(50 + '…[truncated]'.length);
    expect(output.endsWith('…[truncated]')).toBe(true);
  });

  it('returns empty output with references for zero results', () => {
    expect(formatAnysearchResultsForLLM(0, [])).toEqual({ output: '', references: [] });
  });
});

describe('createAnysearchSearchTool', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockedAxios.create.mockReset();
    mockedAxios.create.mockReturnValue({ post: mockPost } as unknown as AxiosInstance);
    clearAnysearchSubDomainCache();
  });

  describe('JSON-RPC request shape', () => {
    it('sends a tools/call request carrying only the defined arguments', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse('## Search Results (0 results, 3ms)'));
      const tool = createAnysearchSearchTool({});
      await invokeTool(tool, {
        query: 'AAPL',
        domain: 'finance',
        sub_domain: 'finance.quote',
        sub_domain_params: { type: 'stock', symbol: 'AAPL', cn_code: '' },
        max_results: 3,
      });

      expect(mockPost).toHaveBeenCalledTimes(1);
      const [url, body] = mockPost.mock.calls[0];
      expect(url).toBe('');
      expect(body).toEqual({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'search',
          arguments: {
            query: 'AAPL',
            domain: 'finance',
            sub_domain: 'finance.quote',
            sub_domain_params: { type: 'stock', symbol: 'AAPL', cn_code: '' },
            max_results: 3,
          },
        },
      });
    });

    it('omits vertical fields from a general search request', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse('## Search Results (0 results, 3ms)'));
      const tool = createAnysearchSearchTool({});
      await invokeTool(tool, { query: 'open source chat', max_results: 5 });

      const [, body] = mockPost.mock.calls[0];
      expect(body.params.arguments).toEqual({ query: 'open source chat', max_results: 5 });
    });

    it('configures the axios client with client header, bearer key, and SSRF agents', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse('## Search Results (0 results, 3ms)'));
      const httpAgent = new http.Agent();
      const httpsAgent = new https.Agent();
      createAnysearchSearchTool({
        anysearchApiKey: 'secret-key',
        httpAgent,
        httpsAgent,
      });

      expect(mockedAxios.create).toHaveBeenCalledTimes(1);
      const createConfig = createdClientConfig();
      expect(createConfig.baseURL).toBe(ANYSEARCH_DEFAULT_API_URL);
      expect(createConfig.headers['X-Anysearch-Client']).toBe(ANYSEARCH_CLIENT_HEADER);
      expect(createConfig.headers.Authorization).toBe('Bearer secret-key');
      expect(createConfig.httpAgent).toBe(httpAgent);
      expect(createConfig.httpsAgent).toBe(httpsAgent);
    });

    it('sends no Authorization header when no key is configured', () => {
      createAnysearchSearchTool({});
      const createConfig = createdClientConfig();
      expect(createConfig.headers.Authorization).toBeUndefined();
    });

    it('uses the configured API URL, timeout, and default max results', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse('## Search Results (0 results, 3ms)'));
      const tool = createAnysearchSearchTool({
        anysearchApiUrl: 'https://proxy.example.com/mcp',
        anysearchSearchOptions: { maxResults: 4, timeout: 20000 },
      });
      await invokeTool(tool, { query: 'test' });

      const createConfig = createdClientConfig();
      expect(createConfig.baseURL).toBe('https://proxy.example.com/mcp');
      expect(createConfig.timeout).toBe(20000);
      const [, body] = mockPost.mock.calls[0];
      expect(body.params.arguments).toEqual({ query: 'test', max_results: 4 });
    });
  });

  describe('error handling', () => {
    it('returns Search failed for a JSON-RPC error without calling onSearchResults', async () => {
      mockPost.mockResolvedValue({
        data: { jsonrpc: '2.0', id: 1, error: { message: 'rate limited' } },
      });
      const onSearchResults = jest.fn();
      const tool = createAnysearchSearchTool({ onSearchResults });
      const message = await invokeTool(tool, { query: 'test' });

      expect(message.content).toBe('Search failed: AnySearch request failed: rate limited');
      const artifact = artifactOf(message);
      expect(artifact.web_search.organic).toEqual([]);
      expect(artifact.web_search.topStories).toEqual([]);
      expect(artifact.web_search.references).toEqual([]);
      expect(artifact.web_search.error).toBe('AnySearch request failed: rate limited');
      expect(artifact.outcome).toBeUndefined();
      expect(onSearchResults).not.toHaveBeenCalled();
    });

    it('returns Search failed for an HTTP error', async () => {
      mockPost.mockRejectedValue(
        Object.assign(new Error('Request failed with status code 500'), {
          response: { status: 500 },
        }),
      );
      const onSearchResults = jest.fn();
      const tool = createAnysearchSearchTool({ onSearchResults });
      const message = await invokeTool(tool, { query: 'test' });

      expect(message.content).toBe(
        'Search failed: AnySearch request failed: Request failed with status code 500',
      );
      expect(onSearchResults).not.toHaveBeenCalled();
    });
  });

  describe('mode precedence', () => {
    it('extract_url wins over query and calls the extract tool', async () => {
      mockPost.mockResolvedValue(
        jsonRpcResponse(
          JSON.stringify({ url: 'https://example.com', title: 'Example', content: '# Example' }),
        ),
      );
      const tool = createAnysearchSearchTool({});
      const message = await invokeTool(tool, {
        query: 'ignored',
        extract_url: 'https://example.com',
      });

      const [, body] = mockPost.mock.calls[0];
      expect(body.params.name).toBe('extract');
      expect(body.params.arguments).toEqual({ url: 'https://example.com' });
      expect(message.content).toContain('# Example');
      expect(artifactOf(message).outcome).toBe('Read https://example.com');
    });

    it('get_sub_domains wins over queries and calls the directory tool', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse(SAMPLE_DIRECTORY_TEXT));
      const tool = createAnysearchSearchTool({});
      const message = await invokeTool(tool, {
        queries: [{ query: 'ignored' }],
        get_sub_domains: true,
        domain: 'finance',
      });

      const [, body] = mockPost.mock.calls[0];
      expect(body.params.name).toBe('get_sub_domains');
      expect(body.params.arguments).toEqual({ domain: 'finance' });
      expect(message.content).toContain('### finance.quote');
      expect(artifactOf(message).outcome).toBe('Listed sub-domains for finance');
    });

    it('queries wins over query and calls the batch_search tool', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse(SAMPLE_BATCH_TEXT));
      const tool = createAnysearchSearchTool({});
      await invokeTool(tool, {
        query: 'ignored',
        queries: [{ query: 'AAPL' }, { query: 'MSFT', max_results: 2 }],
      });

      const [, body] = mockPost.mock.calls[0];
      expect(body.params.name).toBe('batch_search');
      expect(body.params.arguments).toEqual({
        queries: [{ query: 'AAPL', max_results: 10 }, { query: 'MSFT', max_results: 2 }],
      });
    });

    it('calls the search tool for a plain query', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse(SAMPLE_SEARCH_TEXT));
      const tool = createAnysearchSearchTool({});
      await invokeTool(tool, { query: 'AAPL' });

      const [, body] = mockPost.mock.calls[0];
      expect(body.params.name).toBe('search');
    });
  });

  describe('get_sub_domains caching', () => {
    it('serves a second call within the TTL from the cache', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse(SAMPLE_DIRECTORY_TEXT));
      const tool = createAnysearchSearchTool({});

      const first = await invokeTool(tool, { get_sub_domains: true, domain: 'finance' });
      const second = await invokeTool(tool, { get_sub_domains: true, domain: 'finance' });

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(second.content).toBe(first.content);
      expect(artifactOf(second).outcome).toBe('Listed sub-domains for finance');
    });

    it('passes multiple domains as a domains array', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse(SAMPLE_DIRECTORY_TEXT));
      const tool = createAnysearchSearchTool({});
      await invokeTool(tool, { get_sub_domains: true, domains: ['finance', 'code'] });

      const [, body] = mockPost.mock.calls[0];
      expect(body.params.arguments).toEqual({ domains: ['finance', 'code'] });
    });
  });

  describe('validation', () => {
    it('rejects a batch with more than five queries', async () => {
      const tool = createAnysearchSearchTool({});
      const [content, artifact] = await invokeToolFunc(tool, {
        queries: [1, 2, 3, 4, 5, 6].map((n) => ({ query: `q${n}` })),
      });

      expect(content).toBe('Search failed: queries must contain 1-5 items.');
      expect(artifact.web_search.error).toBe('queries must contain 1-5 items.');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('rejects sub_domain without domain', async () => {
      const tool = createAnysearchSearchTool({});
      const message = await invokeTool(tool, { query: 'AAPL', sub_domain: 'finance.quote' });

      expect(message.content).toBe('Search failed: sub_domain requires domain.');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('rejects a non-http extract_url', async () => {
      const tool = createAnysearchSearchTool({});
      const message = await invokeTool(tool, { extract_url: 'ftp://example.com/file' });

      expect(String(message.content)).toContain('Search failed: extract_url must be an http(s) URL');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('rejects an unparseable extract_url', async () => {
      const tool = createAnysearchSearchTool({});
      const message = await invokeTool(tool, { extract_url: 'not a url' });

      expect(String(message.content)).toContain('Search failed: extract_url is not a valid URL');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('rejects get_sub_domains without domain or domains', async () => {
      const tool = createAnysearchSearchTool({});
      const message = await invokeTool(tool, { get_sub_domains: true });

      expect(message.content).toBe(
        'Search failed: get_sub_domains requires domain or a non-empty domains list.',
      );
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('rejects an empty parameter set with a self-correcting error', async () => {
      const tool = createAnysearchSearchTool({});
      const message = await invokeTool(tool, {});

      expect(message.content).toBe(
        'Search failed: Provide exactly one mode: query, queries, get_sub_domains, or extract_url.',
      );
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('rejects a batch item without a query', async () => {
      const tool = createAnysearchSearchTool({});
      const [content] = await invokeToolFunc(tool, {
        queries: [{ query: 'AAPL' }, { domain: 'finance' }],
      });

      expect(content).toBe('Search failed: Each queries item requires a query string.');
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('search contract', () => {
    it('reports results through onSearchResults and returns anchor-tagged output', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse(SAMPLE_SEARCH_TEXT));
      const onSearchResults = jest.fn();
      const tool = createAnysearchSearchTool({ onSearchResults });
      const message = await invokeTool(tool, { query: 'AAPL' });

      expect(onSearchResults).toHaveBeenCalledTimes(1);
      const [results, runtime] = onSearchResults.mock.calls[0];
      expect(results.success).toBe(true);
      expect(results.data.organic).toHaveLength(2);
      expect(results.data.topStories).toEqual([]);
      expect(runtime).toEqual(
        expect.objectContaining({ toolCall: expect.objectContaining({ name: 'web_search' }) }),
      );

      const content = String(message.content);
      expect(content).toContain('=== Web Results, Turn 0 ===');
      expect(content).toContain('Anchor: \\ue202turn0search0');
      expect(content).toContain('Anchor: \\ue202turn0search1');

      const artifact = artifactOf(message);
      expect(artifact.web_search.turn).toBe(0);
      expect(artifact.web_search.organic).toEqual(results.data.organic);
      expect(artifact.web_search.topStories).toEqual([]);
      expect(artifact.web_search.references).toEqual([
        {
          link: 'https://finance.yahoo.com/quote/AAPL',
          type: 'link',
          title: 'Apple Inc. (AAPL) Stock Price',
        },
        {
          link: 'https://www.marketwatch.com/investing/stock/aapl',
          type: 'link',
          title: 'AAPL - Apple Stock Quote',
        },
      ]);
      expect(artifact.outcome).toBe('Found 2 results for "AAPL"');
    });

    it('stamps the configured turn into output and artifact', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse(SAMPLE_SEARCH_TEXT));
      const tool = createAnysearchSearchTool({});
      const message = await invokeTool(tool, { query: 'AAPL' }, 3);

      expect(String(message.content)).toContain('=== Web Results, Turn 3 ===');
      expect(String(message.content)).toContain('Anchor: \\ue202turn3search0');
      expect(artifactOf(message).web_search.turn).toBe(3);
    });

    it('omits the outcome and returns empty organic for a genuine zero-result search', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse('## Search Results (0 results, 3ms)'));
      const onSearchResults = jest.fn();
      const tool = createAnysearchSearchTool({ onSearchResults });
      const message = await invokeTool(tool, { query: 'zzz no results' });

      const artifact = artifactOf(message);
      expect(artifact.web_search.organic).toEqual([]);
      expect(artifact.outcome).toBeUndefined();
      expect(String(message.content)).not.toContain('=== Raw Response ===');
      expect(onSearchResults).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
        expect.anything(),
      );
    });

    it('falls back to a raw response section when parsing yields nothing from non-empty text', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse('Unexpected payload shape'));
      const tool = createAnysearchSearchTool({});
      const message = await invokeTool(tool, { query: 'test' });

      const content = String(message.content);
      expect(content).toContain('=== Raw Response ===');
      expect(content).toContain('Unexpected payload shape');
    });

    it('truncates search output to maxOutputChars', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse(SAMPLE_SEARCH_TEXT));
      const tool = createAnysearchSearchTool({ maxOutputChars: 80 });
      const message = await invokeTool(tool, { query: 'AAPL' });

      expect(String(message.content).length).toBeLessThanOrEqual(80 + '…[truncated]'.length);
    });
  });

  describe('batch contract', () => {
    it('merges, dedupes, and labels batch results', async () => {
      mockPost.mockResolvedValue(jsonRpcResponse(SAMPLE_BATCH_TEXT));
      const onSearchResults = jest.fn();
      const tool = createAnysearchSearchTool({ onSearchResults });
      const message = await invokeTool(tool, {
        queries: [{ query: 'AAPL' }, { query: 'MSFT' }],
      });

      const artifact = artifactOf(message);
      const organic = artifact.web_search.organic ?? [];
      expect(organic).toHaveLength(2);
      expect(organic.map((r) => r.link)).toEqual([
        'https://finance.yahoo.com/quote/AAPL',
        'https://finance.yahoo.com/quote/MSFT',
      ]);
      expect(artifact.outcome).toBe('Found 2 results for "AAPL | MSFT"');
      expect(onSearchResults).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
        expect.anything(),
      );
    });
  });

  describe('extract contract', () => {
    it('prefixes the title unless the content already starts with a heading', async () => {
      mockPost.mockResolvedValue(
        jsonRpcResponse(JSON.stringify({ title: 'Example Domain', content: 'Plain intro text.' })),
      );
      const tool = createAnysearchSearchTool({});
      const message = await invokeTool(tool, { extract_url: 'https://example.com' });

      expect(message.content).toBe('# Example Domain\n\nPlain intro text.');
      const artifact = artifactOf(message);
      expect(artifact.web_search.organic).toEqual([]);
      expect(artifact.outcome).toBe('Read https://example.com');
    });

    it('keeps content that already starts with a heading intact', async () => {
      mockPost.mockResolvedValue(
        jsonRpcResponse(
          JSON.stringify({ title: 'Example', content: '# Own heading\n\nBody.' }),
        ),
      );
      const tool = createAnysearchSearchTool({});
      const message = await invokeTool(tool, { extract_url: 'https://example.com' });

      expect(message.content).toBe('# Own heading\n\nBody.');
    });

    it('does not call onSearchResults in extract mode', async () => {
      mockPost.mockResolvedValue(
        jsonRpcResponse(JSON.stringify({ title: 'Example', content: 'Body.' })),
      );
      const onSearchResults = jest.fn();
      const tool = createAnysearchSearchTool({ onSearchResults });
      await invokeTool(tool, { extract_url: 'https://example.com' });

      expect(onSearchResults).not.toHaveBeenCalled();
    });
  });
});
