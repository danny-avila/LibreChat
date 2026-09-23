import axios from 'axios';
import { INTENT_PROPERTY } from '@librechat/agents';
import { tool, DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import type { SearchResult, SearchResultData } from 'librechat-data-provider';
import type { AxiosInstance } from 'axios';
import type https from 'node:https';
import type http from 'node:http';
/**
 * AnySearch is a real-time search service speaking JSON-RPC 2.0 over HTTPS
 * with four tools: `search` (general + vertical), `get_sub_domains`
 * (directory), `batch_search` (parallel queries), and `extract` (page to
 * Markdown). This module vendors the `web_search` LangChain tool for the
 * `anysearch` provider because `@librechat/agents`'s `createSearchTool`
 * dispatches over a closed provider switch; the tool keeps the SDK's tool
 * name, citation anchors, artifact shape, and callbacks so permissions,
 * toggles, native-search stripping, and the result/citation UI work
 * unchanged. All four capabilities are exposed as parameters of the one
 * tool instead of four separate tools.
 */

export const ANYSEARCH_DEFAULT_API_URL = 'https://api.anysearch.com/mcp';
/** Probes confirmed the endpoint accepts any (or no) client header value. */
export const ANYSEARCH_CLIENT_HEADER = 'librechat-websearch/1.0.0';
export const ANYSEARCH_DEFAULT_TIMEOUT_MS = 30000;
/** The AnySearch API doc mandates caching `get_sub_domains` per session. */
export const ANYSEARCH_SUB_DOMAIN_CACHE_TTL_MS = 600000;
export const ANYSEARCH_MAX_OUTPUT_CHARS = 50000;
const ANYSEARCH_CACHE_MAX_ENTRIES = 128;
const ANYSEARCH_MAX_BATCH_QUERIES = 5;
const ANYSEARCH_MAX_DOMAINS = 5;
const MAX_OUTCOME_CHARS = 120;

export interface AnysearchLogger {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface AnysearchSearchOptions {
  maxResults?: number;
  timeout?: number;
}

/**
 * Structural slice of the runtime config the agents framework hands the tool;
 * kept minimal so the vendored tool does not depend on which `@langchain/core`
 * copy resolves it (`@librechat/agents` nests its own).
 */
interface AnysearchToolRuntime {
  toolCall?: unknown;
}

export interface AnysearchToolConfig {
  anysearchApiKey?: string;
  anysearchApiUrl?: string;
  anysearchSearchOptions?: AnysearchSearchOptions;
  httpAgent?: http.Agent;
  httpsAgent?: https.Agent;
  maxOutputChars?: number;
  onSearchResults?: (results: SearchResult, runnableConfig: unknown) => void;
  /** Accepted for signature parity with the SDK's createSearchTool; the vendored tool does no highlight enrichment. */
  onGetHighlights?: (link: string) => void;
  logger?: AnysearchLogger;
}

export interface AnysearchOrganicResult {
  title: string;
  link: string;
  snippet: string;
}

interface AnysearchBatchQuery {
  query: string;
  domain?: string;
  sub_domain?: string;
  sub_domain_params?: Record<string, string>;
  max_results?: number;
}

export interface AnysearchToolParams {
  intent?: string;
  query?: string;
  domain?: string;
  sub_domain?: string;
  sub_domain_params?: Record<string, string>;
  max_results?: number;
  queries?: Array<Partial<AnysearchBatchQuery>>;
  get_sub_domains?: boolean;
  domains?: string[];
  extract_url?: string;
}

export interface AnysearchToolArtifact {
  web_search: SearchResultData;
  outcome?: string;
}

interface AnysearchContentItem {
  type?: string;
  text?: string;
}

interface AnysearchJsonRpcResponse {
  result?: { content?: AnysearchContentItem[] };
  error?: { message?: string };
}

/**
 * Calls one AnySearch MCP tool over JSON-RPC 2.0 and returns its first text
 * content block. Network failures, non-2xx statuses, and JSON-RPC errors all
 * throw so callers surface one `Search failed:` shape to the model.
 */
export async function callAnysearchTool(
  toolName: string,
  args: Record<string, unknown>,
  client: AxiosInstance,
): Promise<string> {
  let response;
  try {
    response = await client.post<AnysearchJsonRpcResponse>('', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    });
  } catch (error) {
    // Network failures and non-2xx statuses share the JSON-RPC error wording.
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`AnySearch request failed: ${message}`);
  }
  const payload = response.data;
  if (payload?.error) {
    throw new Error(`AnySearch request failed: ${payload.error.message ?? 'unknown error'}`);
  }
  const textItem = payload?.result?.content?.find((item) => item?.type === 'text');
  if (textItem?.text != null) {
    return textItem.text;
  }
  return JSON.stringify(payload?.result ?? {});
}

const SEARCH_RESULT_HEADER_REGEX = /^### \d+\.\s*(.+)$/;
const SEARCH_RESULT_URL_REGEX = /^- \*\*URL\*\*: (.+)$/;
const BATCH_QUERY_HEADER_REGEX = /^## Query \d+: /;

function finalizeParsedResult(block: {
  title: string;
  link?: string;
  snippetLines: string[];
}): AnysearchOrganicResult | null {
  if (block.link == null || block.link === '') {
    // Without a URL a result can neither be cited nor rendered as a source.
    return null;
  }
  return { title: block.title, link: block.link, snippet: block.snippetLines.join(' ') };
}

/**
 * Parses the Markdown shape AnySearch returns for `search` (and for each
 * `batch_search` section): `### 1. Title` / `- **URL**: link` / `- snippet
 * lines`. Vertical results use the same shape with structured snippet lines
 * (e.g. `- Symbol: AAPL | Name: Apple Inc. | ...`).
 */
export function parseSearchMarkdown(text: string): AnysearchOrganicResult[] {
  if (!text) {
    return [];
  }
  const results: AnysearchOrganicResult[] = [];
  let current: { title: string; link?: string; snippetLines: string[] } | null = null;
  const flush = () => {
    if (current == null) {
      return;
    }
    const finalized = finalizeParsedResult(current);
    if (finalized != null) {
      results.push(finalized);
    }
    current = null;
  };
  for (const line of text.split('\n')) {
    const headerMatch = SEARCH_RESULT_HEADER_REGEX.exec(line);
    if (headerMatch) {
      flush();
      current = { title: headerMatch[1].trim(), snippetLines: [] };
      continue;
    }
    if (current == null) {
      continue;
    }
    const urlMatch = SEARCH_RESULT_URL_REGEX.exec(line);
    if (urlMatch) {
      current.link = urlMatch[1].trim();
      continue;
    }
    if (line.startsWith('## ')) {
      // `## Search Results (N results, Xms)` is a section header, not a snippet.
      continue;
    }
    if (line.trim() !== '') {
      current.snippetLines.push(line.trim());
    }
  }
  flush();
  return results;
}

/**
 * Parses `batch_search` output: repeated `## Query N: <query>` sections, each
 * containing a search-format block. Results are merged in order and deduped
 * by link (first occurrence wins).
 */
export function parseBatchMarkdown(text: string): AnysearchOrganicResult[] {
  if (!text) {
    return [];
  }
  const sections: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) {
      sections.push(current.join('\n'));
    }
    current = [];
  };
  for (const line of text.split('\n')) {
    if (BATCH_QUERY_HEADER_REGEX.test(line)) {
      flush();
    } else {
      current.push(line);
    }
  }
  flush();

  const seenLinks = new Set<string>();
  const merged: AnysearchOrganicResult[] = [];
  for (const section of sections) {
    for (const result of parseSearchMarkdown(section)) {
      if (seenLinks.has(result.link)) {
        continue;
      }
      seenLinks.add(result.link);
      merged.push(result);
    }
  }
  return merged;
}

/**
 * Parses `extract` output: JSON `{"url":…,"title":…,"content":"<markdown>"}`
 * (content truncated at 50,000 chars server-side). Non-JSON payloads fall
 * back to the raw text as content.
 */
export function parseExtractResponse(text: string): { title?: string; content: string } {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed != null && typeof parsed === 'object' && 'content' in parsed) {
      const record = parsed as { title?: unknown; content: unknown };
      if (typeof record.content === 'string') {
        return {
          ...(typeof record.title === 'string' && record.title !== ''
            ? { title: record.title }
            : {}),
          content: record.content,
        };
      }
    }
  } catch {
    // Not JSON — fall through to the raw-text fallback.
  }
  return { content: text };
}

const subDomainCache = new Map<string, { text: string; expiresAt: number }>();

function subDomainCacheKey(domains: string[]): string {
  return [...domains].sort().join(',');
}

function getCachedSubDomains(key: string): string | undefined {
  const entry = subDomainCache.get(key);
  if (entry == null) {
    return undefined;
  }
  if (entry.expiresAt <= Date.now()) {
    subDomainCache.delete(key);
    return undefined;
  }
  return entry.text;
}

function cacheSubDomains(key: string, text: string): void {
  if (subDomainCache.size >= ANYSEARCH_CACHE_MAX_ENTRIES) {
    // Map iterates in insertion order; evict the oldest entry.
    const oldest = subDomainCache.keys().next();
    if (!oldest.done) {
      subDomainCache.delete(oldest.value);
    }
  }
  subDomainCache.set(key, { text, expiresAt: Date.now() + ANYSEARCH_SUB_DOMAIN_CACHE_TTL_MS });
}

/** Test seam: clears the per-session `get_sub_domains` cache. */
export function clearAnysearchSubDomainCache(): void {
  subDomainCache.clear();
}

function resolveMaxOutputChars(maxOutputChars?: number): number {
  if (maxOutputChars != null && maxOutputChars > 0) {
    return maxOutputChars;
  }
  const envValue = Number(process.env.SEARCH_MAX_LLM_OUTPUT_CHARS);
  if (Number.isFinite(envValue) && envValue > 0) {
    return envValue;
  }
  return ANYSEARCH_MAX_OUTPUT_CHARS;
}

function truncateOutput(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}…[truncated]`;
}

function boundOutcome(label: string): string {
  return label.length <= MAX_OUTCOME_CHARS ? label : `${label.slice(0, MAX_OUTCOME_CHARS)}…`;
}

/**
 * Mirrors the SDK's private `formatResultsForLLM` for the sections this tool
 * produces: a `Web Results` section whose sources carry the `\ue202` citation
 * anchors the framework and the client render as source chips.
 */
export function formatAnysearchResultsForLLM(
  turn: number,
  organic: AnysearchOrganicResult[],
  maxOutputChars?: number,
): { output: string; references: NonNullable<SearchResultData['references']> } {
  const references = organic.map((result) => ({
    link: result.link,
    type: 'link' as const,
    title: result.title,
  }));
  if (organic.length === 0) {
    return { output: '', references };
  }
  const outputLines: string[] = ['', `=== Web Results, Turn ${turn} ===`, ''];
  for (let i = 0; i < organic.length; i++) {
    const result = organic[i];
    outputLines.push(`# Search ${i}: ${result.title !== '' ? `"${result.title}"` : '(no title)'}`);
    outputLines.push(`\nAnchor: \\ue202turn${turn}search${i}`);
    outputLines.push(`URL: ${result.link}`);
    if (result.snippet !== '') {
      outputLines.push(`Summary: ${result.snippet}`);
    }
    outputLines.push('');
  }
  const output = truncateOutput(outputLines.join('\n').trim(), resolveMaxOutputChars(maxOutputChars));
  return { output, references };
}

const ANYSEARCH_DOMAINS = [
  'general',
  'resource',
  'social_media',
  'finance',
  'academic',
  'legal',
  'health',
  'business',
  'security',
  'ip',
  'code',
  'energy',
  'environment',
  'agriculture',
  'travel',
  'film',
  'gaming',
];

const anysearchToolSchema = {
  type: 'object',
  properties: {
    intent: { ...INTENT_PROPERTY },
    query: {
      type: 'string',
      description:
        'Search query. Use alone for general web search, or with domain+sub_domain+sub_domain_params for vertical search. Start broad, then narrow; prefer precise keywords over sentences.',
    },
    domain: {
      type: 'string',
      description: `Vertical domain for higher-quality domain-specific results: ${ANYSEARCH_DOMAINS.join(', ')}. Requires sub_domain when set.`,
    },
    sub_domain: {
      type: 'string',
      description:
        'Sub-domain routing key (e.g. "finance.quote"). Discover valid values with get_sub_domains before vertical search.',
    },
    sub_domain_params: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description:
        'Parameters for the sub_domain, per its directory entry. Include ALL params marked (required), using empty string values for inapplicable ones, e.g. {"type":"stock","symbol":"AAPL","cn_code":""}.',
    },
    max_results: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      description: 'Maximum results to return (1-10, default 10).',
    },
    queries: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      description:
        'Batch mode: 1-5 queries executed in parallel with merged, deduplicated results. Each item: {query (required), domain, sub_domain, sub_domain_params, max_results}. Use for hybrid searches (one general + N vertical) or multi-part questions.',
      items: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          domain: { type: 'string' },
          sub_domain: { type: 'string' },
          sub_domain_params: { type: 'object', additionalProperties: { type: 'string' } },
          max_results: { type: 'integer', minimum: 1, maximum: 10 },
        },
      },
    },
    get_sub_domains: {
      type: 'boolean',
      description:
        'Directory mode: instead of searching, return the available sub_domains and their parameters for `domain` (single) or `domains`. Call this FIRST when a topic is domain-specific.',
    },
    domains: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 5,
      description: 'Domains for get_sub_domains (1-5).',
    },
    extract_url: {
      type: 'string',
      description:
        'Extraction mode: fetch one web page as Markdown instead of searching. Use to read beyond result snippets.',
    },
  },
  // No `required`: exactly one mode argument must be provided and the runtime
  // validates, returning a self-correcting error to the model.
} as const;

const ANYSEARCH_TOOL_DESCRIPTION = `Real-time web search with vertical domain search, parallel batch search, sub-domain directory lookup, and full-page extraction. Results have required citation anchors.

MODES (exactly one per call):
1. Search: \`query\` alone for general web search, or \`query\` + \`domain\` + \`sub_domain\` (+ \`sub_domain_params\`) for vertical search — vertical produces significantly better results for domain-specific topics (finance, academic, health, code, legal, travel, etc.).
2. Batch: \`queries\` (1-5) runs all queries in parallel and merges results; each item may target a different domain. Use a hybrid batch (1 general + N vertical) whenever unsure whether a topic is domain-specific.
3. Directory: \`get_sub_domains: true\` with \`domain\` (or \`domains\`) returns the sub-domain directory and each sub-domain's parameters. Call this BEFORE the first vertical search in a domain.
4. Read page: \`extract_url\` fetches a single page as Markdown to read beyond snippets.

VERTICAL RULES: include ALL sub_domain params marked (required), passing empty strings for inapplicable ones. Pick the sub_domain whose description best matches the intent.

Cite sources ONLY with the anchor tokens provided with each result. NEVER use markdown links, [1], or footnotes. CITE ONLY with anchors provided.`;

function readTurn(runtime: AnysearchToolRuntime | undefined): number {
  const toolCall: unknown = runtime?.toolCall;
  if (toolCall != null && typeof toolCall === 'object' && 'turn' in toolCall) {
    const turn = (toolCall as { turn?: unknown }).turn;
    if (typeof turn === 'number') {
      return turn;
    }
  }
  return 0;
}

function clampMaxResults(value: number | undefined, fallback: number): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved)) {
    return fallback;
  }
  return Math.min(10, Math.max(1, Math.round(resolved)));
}

/** The vendored `web_search` tool instance for the AnySearch provider. */
export type AnysearchWebSearchTool = DynamicStructuredTool;

/**
 * Creates the vendored `web_search` tool for the AnySearch provider. The tool
 * name matches `Tools.web_search` so every downstream consumer (permissions,
 * toggles, native-search stripping, result/citation UI) keeps working.
 */
export function createAnysearchSearchTool(
  config: AnysearchToolConfig = {},
): AnysearchWebSearchTool {
  const {
    anysearchApiKey,
    anysearchApiUrl,
    anysearchSearchOptions,
    httpAgent,
    httpsAgent,
    maxOutputChars,
    onSearchResults,
    logger,
  } = config;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Anysearch-Client': ANYSEARCH_CLIENT_HEADER,
  };
  if (anysearchApiKey) {
    headers.Authorization = `Bearer ${anysearchApiKey}`;
  }
  const client = axios.create({
    baseURL: anysearchApiUrl || ANYSEARCH_DEFAULT_API_URL,
    timeout: anysearchSearchOptions?.timeout ?? ANYSEARCH_DEFAULT_TIMEOUT_MS,
    headers,
    ...(httpAgent != null && { httpAgent }),
    ...(httpsAgent != null && { httpsAgent }),
  });

  const outputLimit = resolveMaxOutputChars(maxOutputChars);

  return tool(
    async (
      params: AnysearchToolParams,
      runtime: AnysearchToolRuntime,
    ): Promise<[string, AnysearchToolArtifact]> => {
      const turn = readTurn(runtime);
      const failure = (message: string): [string, AnysearchToolArtifact] => {
        logger?.error?.(`AnySearch web_search failed: ${message}`);
        return [
          `Search failed: ${message}`,
          {
            web_search: {
              turn,
              organic: [],
              topStories: [],
              references: [],
              error: message,
            },
          },
        ];
      };

      try {
        // Mode precedence: extract_url > get_sub_domains > queries > query.
        if (params.extract_url != null) {
          const url = params.extract_url.trim();
          let parsed: URL;
          try {
            parsed = new URL(url);
          } catch {
            return failure(`extract_url is not a valid URL: ${url}`);
          }
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return failure(`extract_url must be an http(s) URL: ${url}`);
          }
          const text = await callAnysearchTool('extract', { url }, client);
          const { title, content } = parseExtractResponse(text);
          const body =
            title != null && !content.startsWith('#') ? `# ${title}\n\n${content}` : content;
          return [
            truncateOutput(body, outputLimit),
            {
              web_search: { turn, organic: [], topStories: [], references: [] },
              outcome: boundOutcome(`Read ${url}`),
            },
          ];
        }

        if (params.get_sub_domains === true) {
          const domains =
            params.domains != null && params.domains.length > 0
              ? params.domains.slice(0, ANYSEARCH_MAX_DOMAINS)
              : params.domain != null && params.domain !== ''
                ? [params.domain]
                : null;
          if (domains == null) {
            return failure('get_sub_domains requires domain or a non-empty domains list.');
          }
          const cacheKey = subDomainCacheKey(domains);
          const cached = getCachedSubDomains(cacheKey);
          if (cached != null) {
            return [
              truncateOutput(cached, outputLimit),
              {
                web_search: { turn, organic: [], topStories: [], references: [] },
                outcome: boundOutcome(`Listed sub-domains for ${domains.join(', ')}`),
              },
            ];
          }
          const text = await callAnysearchTool(
            'get_sub_domains',
            domains.length === 1 ? { domain: domains[0] } : { domains },
            client,
          );
          cacheSubDomains(cacheKey, text);
          return [
            truncateOutput(text, outputLimit),
            {
              web_search: { turn, organic: [], topStories: [], references: [] },
              outcome: boundOutcome(`Listed sub-domains for ${domains.join(', ')}`),
            },
          ];
        }

        if (params.queries != null) {
          const queries = params.queries;
          if (!Array.isArray(queries) || queries.length < 1 || queries.length > ANYSEARCH_MAX_BATCH_QUERIES) {
            return failure(`queries must contain 1-${ANYSEARCH_MAX_BATCH_QUERIES} items.`);
          }
          const items: AnysearchBatchQuery[] = [];
          for (const item of queries) {
            if (item == null || typeof item.query !== 'string' || item.query.trim() === '') {
              return failure('Each queries item requires a query string.');
            }
            items.push({
              query: item.query,
              ...(item.domain != null && { domain: item.domain }),
              ...(item.domain != null && item.sub_domain != null && { sub_domain: item.sub_domain }),
              ...(item.domain != null &&
                item.sub_domain_params != null && { sub_domain_params: item.sub_domain_params }),
              max_results: clampMaxResults(item.max_results, 10),
            });
          }
          const text = await callAnysearchTool('batch_search', { queries: items }, client);
          const organic = parseBatchMarkdown(text);
          onSearchResults?.({ success: true, data: { organic, topStories: [] } }, runtime);
          const labels = queries.map((item) => item.query).join(' | ');
          const { output, references } = formatAnysearchResultsForLLM(turn, organic, maxOutputChars);
          const outcome =
            organic.length > 0
              ? boundOutcome(
                  `Found ${organic.length} result${organic.length === 1 ? '' : 's'} for "${labels}"`,
                )
              : undefined;
          return [
            output,
            { web_search: { turn, organic, topStories: [], references }, ...(outcome != null && { outcome }) },
          ];
        }

        if (params.query != null) {
          const query = params.query;
          if (params.sub_domain != null && (params.domain == null || params.domain === '')) {
            return failure('sub_domain requires domain.');
          }
          const maxResults = clampMaxResults(
            params.max_results,
            anysearchSearchOptions?.maxResults ?? 10,
          );
          const text = await callAnysearchTool(
            'search',
            {
              query,
              ...(params.domain != null &&
                params.domain !== '' && {
                  domain: params.domain,
                  ...(params.sub_domain != null && { sub_domain: params.sub_domain }),
                  ...(params.sub_domain_params != null && {
                    sub_domain_params: params.sub_domain_params,
                  }),
                }),
              max_results: maxResults,
            },
            client,
          );
          const organic = parseSearchMarkdown(text);
          const { output, references } = formatAnysearchResultsForLLM(turn, organic, maxOutputChars);
          const finalOutput =
            organic.length === 0 && text.trim() !== '' && !/0 results/i.test(text)
              ? // Format-drift safety: surface the raw payload so the model
                // still sees the data even if AnySearch changes its Markdown shape.
                `${output}${output !== '' ? '\n\n' : ''}=== Raw Response ===\n\n${truncateOutput(text, outputLimit)}`
              : output;
          onSearchResults?.({ success: true, data: { organic, topStories: [] } }, runtime);
          const outcome =
            organic.length > 0
              ? boundOutcome(`Found ${organic.length} result${organic.length === 1 ? '' : 's'} for "${query}"`)
              : undefined;
          return [
            finalOutput,
            { web_search: { turn, organic, topStories: [], references }, ...(outcome != null && { outcome }) },
          ];
        }

        return failure('Provide exactly one mode: query, queries, get_sub_domains, or extract_url.');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return failure(message);
      }
    },
    {
      name: 'web_search',
      description: ANYSEARCH_TOOL_DESCRIPTION,
      schema: anysearchToolSchema,
      responseFormat: 'content_and_artifact',
    },
  );
}
