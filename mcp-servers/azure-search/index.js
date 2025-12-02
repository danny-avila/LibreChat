#!/usr/bin/env node
/**
 * MCP Server for Azure AI Search Integration
 * Provides FAQ grounding for Woodland agents via Azure Cognitive Search
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SearchClient, AzureKeyCredential } from '@azure/search-documents';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT;
const API_KEY = process.env.AZURE_SEARCH_KEY;
const INDEX_NAME = process.env.AZURE_SEARCH_INDEX_NAME || 'wpp-knowledge-test-encyclopedia';
const TOP_K = parseInt(process.env.AZURE_SEARCH_TOP_K || '5', 10);
const MIN_SCORE = parseFloat(process.env.AZURE_SEARCH_MIN_SCORE || '0.65');
const API_VERSION = process.env.AZURE_SEARCH_API_VERSION || '2024-07-01';
const CITATION_BASE_URL = process.env.FAQ_CITATION_BASE_URL || '';

if (!ENDPOINT || !API_KEY) {
  console.error('[AzureSearchMCP] Missing AZURE_SEARCH_ENDPOINT or AZURE_SEARCH_KEY');
  process.exit(1);
}

// Initialize Azure Search client
const searchClient = new SearchClient(
  ENDPOINT,
  INDEX_NAME,
  new AzureKeyCredential(API_KEY),
);

/**
 * Extract model/rake identifiers from text for tag filtering
 * - Restrict numeric model codes to known Cyclone Rake models to avoid
 *   false positives from tractor models (e.g., John Deere 255).
 * - If the text clearly references a tractor brand ("John Deere"/"JD"),
 *   skip numeric model extraction entirely.
 */
const CR_MODEL_CODES = new Set([
  // Common Cyclone Rake model codes
  '101', '102', '104', '105', '106', '109',
  // Add known dashed variants where tags may include a suffix
  // Note: suffixed variants are matched by name patterns below
]);

function extractAnchors(text) {
  const anchors = {
    models: [],
    modelNames: [],
    rakes: [],
    skus: [],
  };

  const tractorContext = /\b(john\s*deere|\bjd\b)\b/i.test(text);

  // Model patterns: only accept known Cyclone Rake 3-digit codes
  // to avoid capturing tractor numbers (e.g., "255").
  if (!tractorContext) {
    const modelMatch = text.match(/\b(\d{3})\b/g);
    if (modelMatch) {
      modelMatch.forEach((m) => {
        const code = m.trim();
        if (CR_MODEL_CODES.has(code)) {
          anchors.models.push(code);
        }
      });
    }
  }

  // Model names: "102 - Commercial", "Classic", "Commander", etc.
  const modelNamePatterns = [
    /\b(\d{3}\s*-\s*[a-z]+)\b/gi,
    /\b(classic|commander|commercial(?:\s+pro)?|cr\s+pro|xl|pvp)\b/gi,
  ];
  modelNamePatterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      anchors.modelNames.push(...matches.map((m) => m.trim()));
    }
  });

  // Part numbers: "01-04-158", etc.
  const partMatch = text.match(/\b(\d{2}-\d{2}-\d{3})\b/g);
  if (partMatch) {
    anchors.skus.push(...partMatch);
  }

  return anchors;
}

/**
 * Build OData filter from anchors
 */
function buildFilter(anchors) {
  const conditions = [];

  // Model tags: model:102-commercial
  if (anchors.models.length > 0) {
    const modelConds = anchors.models.map((m) => `Tags/any(t: t eq 'model:${m}')`);
    conditions.push(`(${modelConds.join(' or ')})`);
  }

  // Model name tags: modelname:102 - Commercial
  if (anchors.modelNames.length > 0) {
    const nameConds = anchors.modelNames.map((n) => `Tags/any(t: t eq 'modelname:${n}')`);
    conditions.push(`(${nameConds.join(' or ')})`);
  }

  // SKU tags (if indexed)
  if (anchors.skus.length > 0) {
    const skuConds = anchors.skus.map((s) => `Tags/any(t: t eq 'sku:${s}')`);
    conditions.push(`(${skuConds.join(' or ')})`);
  }

  return conditions.length > 0 ? conditions.join(' or ') : null;
}

/**
 * Search Azure AI Search index with tag filtering and scoring
 */
async function searchFAQ(query, options = {}) {
  const anchors = extractAnchors(query);
  const filter = buildFilter(anchors);

  const searchOptions = {
    top: options.top || TOP_K,
    includeTotalCount: true,
    queryType: 'full',
    searchMode: 'any',
  };

  if (filter) {
    searchOptions.filter = filter;
  }

  try {
    const searchResults = await searchClient.search(query, searchOptions);
    const results = [];

    for await (const result of searchResults.results) {
      const score = typeof result.score === 'number' ? result.score : 0;

      // Tag match bonus (if Tags field exists in metadata)
      let tagBonus = 0;
      const metadata = result.document.metadata || result.document.Metadata || {};
      const tags = metadata.Tags || metadata.tags || [];
      
      // Check for exact tag matches
      const hasModelMatch = anchors.models.some((m) => 
        tags.some && tags.some((t) => t.toLowerCase() === `model:${m}`)
      );
      const hasNameMatch = anchors.modelNames.some((n) => 
        tags.some && tags.some((t) => t.toLowerCase() === `modelname:${n.toLowerCase()}`)
      );
      
      if (hasModelMatch || hasNameMatch) {
        tagBonus = 0.15;
      }

      const adjustedScore = score + tagBonus;

      // Extract URL from metadata if available
      const urlField =
        metadata.url ||
        metadata.URL ||
        metadata.source_url ||
        metadata.link ||
        result.document.url ||
        result.document.URL ||
        null;

      results.push({
        id: result.document.id || result.document.Id || result.document.key || result.document.documentId,
        question:
          result.document.title ||
          result.document.Title ||
          result.document.heading ||
          result.document.Heading ||
          '',
        answer:
          result.document.chunk ||
          result.document.content ||
          result.document.Content ||
          result.document.text ||
          result.document.body ||
          '',
        tags: Array.isArray(tags) ? tags : [],
        score: adjustedScore,
        rawScore: score,
        citationUrl: typeof urlField === 'string' ? urlField : null,
      });
    }

    // Sort by adjusted score
    results.sort((a, b) => b.score - a.score);

    return {
      results: results.slice(0, options.top || TOP_K),
      totalCount: searchResults.count || results.length,
      anchorsDetected: anchors,
      filterApplied: !!filter,
    };
  } catch (error) {
    console.error('[AzureSearchMCP] Search error:', error);
    throw new Error(`Azure Search failed: ${error.message}`);
  }
}

/**
 * Format search results as grounded context
 */
function formatGroundingContext(searchResponse) {
  const { results, totalCount, anchorsDetected, filterApplied } = searchResponse;

  if (results.length === 0) {
    return {
      grounding: '[FAQ Grounding: No matching results found]',
      citations: [],
      metadata: { totalCount, anchorsDetected, filterApplied },
    };
  }

  const lines = ['[FAQ Grounding]'];
  
  if (filterApplied) {
    lines.push(`Filters: ${JSON.stringify(anchorsDetected)}`);
  }
  
  lines.push(`Found ${totalCount} total, showing top ${results.length}:\n`);

  const citations = [];

  results.forEach((result, idx) => {
    lines.push(`${idx + 1}. [FAQ:${result.id}] (score: ${result.score.toFixed(2)})`);
    lines.push(`   Q: ${result.question}`);
    lines.push(`   A: ${result.answer}`);
    if (result.tags.length > 0) {
      lines.push(`   Tags: ${result.tags.join(', ')}`);
    }
    if (result.citationUrl) {
      lines.push(`   URL: ${result.citationUrl}`);
      citations.push({
        id: result.id,
        title: result.question,
        url: result.citationUrl,
        score: result.score,
      });
    }
    lines.push('');
  });

  lines.push('[/FAQ Grounding]');

  return {
    grounding: lines.join('\n'),
    citations,
    results,
    metadata: { totalCount, anchorsDetected, filterApplied },
  };
}

// Initialize MCP Server
const server = new Server(
  {
    name: 'azure-search-faq',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Tool: searchWoodlandFAQ
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Debug: log when tools are listed
  // eslint-disable-next-line no-console
  console.error('[AzureSearchMCP] ListTools requested');
  return {
    tools: [
    {
      name: 'searchWoodlandFAQ',
      description: `Search Woodland FAQ knowledge base (Azure AI Search index: ${INDEX_NAME}). 
Retrieves frequently asked questions and answers about Cyclone Rake products, parts, engines, and compatibility.
Automatically filters by detected model names, part numbers, and tags.
Returns scored results with citations.`,
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query (full user question or keywords)',
          },
          top: {
            type: 'number',
            description: `Number of results to return (default: ${TOP_K})`,
          },
          includeRawResults: {
            type: 'boolean',
            description: 'Include raw result objects in response (default: false)',
          },
        },
        required: ['query'],
      },
    },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Debug: log tool call
  // eslint-disable-next-line no-console
  console.error(`[AzureSearchMCP] CallTool requested: ${request.params.name}`);
  if (request.params.name !== 'searchWoodlandFAQ') {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const { query, top, includeRawResults } = request.params.arguments;

  if (!query || typeof query !== 'string') {
    throw new Error('query parameter is required and must be a string');
  }

  const searchResponse = await searchFAQ(query, { top });
  // eslint-disable-next-line no-console
  console.error(`[AzureSearchMCP] Search complete: total=${searchResponse.totalCount} filterApplied=${searchResponse.filterApplied}`);
  const formatted = formatGroundingContext(searchResponse);

  const response = {
    content: [
      {
        type: 'text',
        text: formatted.grounding,
      },
    ],
  };

  // Add metadata as resource if needed
  if (formatted.citations.length > 0) {
    response.content.push({
      type: 'resource',
      resource: {
        uri: 'faq://citations',
        mimeType: 'application/json',
        text: JSON.stringify(formatted.citations, null, 2),
      },
    });
  }

  if (includeRawResults && formatted.results.length > 0) {
    response.content.push({
      type: 'resource',
      resource: {
        uri: 'faq://raw-results',
        mimeType: 'application/json',
        text: JSON.stringify(formatted.results, null, 2),
      },
    });
  }

  return response;
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[AzureSearchMCP] Server started successfully');
  console.error(`[AzureSearchMCP] Endpoint: ${ENDPOINT}`);
  console.error(`[AzureSearchMCP] Index: ${INDEX_NAME}`);
  console.error(`[AzureSearchMCP] Top-K: ${TOP_K}, Min Score: ${MIN_SCORE}`);
}

main().catch((error) => {
  console.error('[AzureSearchMCP] Fatal error:', error);
  process.exit(1);
});
