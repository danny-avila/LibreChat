#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// IEEE Xplore API endpoints
const IEEE_SEARCH_URL = "https://ieeexploreapi.ieee.org/api/v1/search/articles";
const IEEE_DOC_URL = "https://ieeexploreapi.ieee.org/api/v1/search/document";
const MAX_TEXT_LENGTH = 50000;

// --- Types ---

interface IEEEAuthor {
  full_name: string;
  affiliation?: string;
  authorUrl?: string;
  id?: number;
}

interface IEEEArticle {
  title: string;
  authors?: { authors: IEEEAuthor[] };
  abstract?: string;
  publication_title?: string;
  publication_year?: string;
  content_type?: string;
  doi?: string;
  article_number?: string;
  start_page?: string;
  end_page?: string;
  citing_paper_count?: number;
  citing_patent_count?: number;
  is_open_access?: boolean;
  html_url?: string;
  pdf_url?: string;
  index_terms?: {
    ieee_terms?: { terms: string[] };
    author_terms?: { terms: string[] };
  };
  full_text?: string;
}

interface IEEESearchResponse {
  total_records: number;
  articles?: IEEEArticle[];
}

// --- Config Schema ---

export const configSchema = z.object({
  IEEE_API_KEY: z.string().describe("IEEE Xplore API key from developer.ieee.org"),
  IEEE_AUTH_TOKEN: z
    .string()
    .optional()
    .describe("Optional auth token for paywalled full-text access"),
  debug: z.boolean().default(false).describe("Enable debug logging"),
});

// --- API Helpers ---

async function ieeeRequest(
  apiKey: string,
  params: Record<string, string>
): Promise<IEEESearchResponse> {
  const url = new URL(IEEE_SEARCH_URL);
  url.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `IEEE API authentication error (${response.status}). Check your IEEE_API_KEY.`
      );
    }
    if (response.status === 429) {
      throw new Error(
        "IEEE API rate limit exceeded (~200 calls/day on free tier). Try again later."
      );
    }
    throw new Error(`IEEE API error: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as IEEESearchResponse;
}

async function ieeeFullTextRequest(
  apiKey: string,
  articleNumber: string,
  authToken?: string
): Promise<string> {
  const url = new URL(`${IEEE_DOC_URL}/${articleNumber}/fulltext`);
  url.searchParams.set("apikey", apiKey);

  const headers: Record<string, string> = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(url.toString(), { headers });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Full text access denied. This may require an IEEE_AUTH_TOKEN for paywalled content."
      );
    }
    if (response.status === 404) {
      throw new Error(
        `No full text found for article ${articleNumber}. It may not be available.`
      );
    }
    throw new Error(`IEEE full text API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { full_text?: string };
  const text = data.full_text || "";

  if (text.length > MAX_TEXT_LENGTH) {
    return (
      text.substring(0, MAX_TEXT_LENGTH) +
      `\n\n[Truncated: showing ${MAX_TEXT_LENGTH} of ${text.length} characters]`
    );
  }

  return text;
}

// --- Formatters ---

function formatArticle(article: IEEEArticle, verbose = false): string {
  let result = `**${article.title}**\n`;

  if (article.authors?.authors) {
    const names = article.authors.authors.map((a) => a.full_name).join(", ");
    result += `Authors: ${names}\n`;
    if (verbose) {
      article.authors.authors.forEach((a) => {
        if (a.affiliation) result += `  - ${a.full_name}: ${a.affiliation}\n`;
      });
    }
  }

  if (article.publication_title) result += `Publication: ${article.publication_title}\n`;
  if (article.publication_year) result += `Year: ${article.publication_year}\n`;
  if (article.content_type) result += `Type: ${article.content_type}\n`;
  if (article.doi) result += `DOI: ${article.doi}\n`;
  if (article.start_page && article.end_page) {
    result += `Pages: ${article.start_page}-${article.end_page}\n`;
  }
  if (article.citing_paper_count !== undefined) {
    result += `Citations: ${article.citing_paper_count}\n`;
  }
  if (article.article_number) result += `Article #: ${article.article_number}\n`;
  if (article.is_open_access) result += `Open Access: Yes\n`;
  if (article.html_url) result += `URL: ${article.html_url}\n`;

  if (article.abstract) {
    result += `\nAbstract: ${article.abstract}\n`;
  }

  if (verbose && article.index_terms) {
    if (article.index_terms.ieee_terms?.terms) {
      result += `IEEE Terms: ${article.index_terms.ieee_terms.terms.join(", ")}\n`;
    }
    if (article.index_terms.author_terms?.terms) {
      result += `Author Keywords: ${article.index_terms.author_terms.terms.join(", ")}\n`;
    }
  }

  return result;
}

function formatSearchResults(data: IEEESearchResponse, query: string): string {
  const total = data.total_records ?? 0;
  let result = `Found ${total} IEEE papers matching "${query}"\n\n`;

  if (data.articles) {
    data.articles.forEach((article, i) => {
      result += `${i + 1}. ${formatArticle(article)}\n`;
    });

    if (total > data.articles.length) {
      result += `\nShowing ${data.articles.length} of ${total} results. Use startRecord and maxRecords to paginate.\n`;
    }
  } else {
    result += "No articles found.\n";
  }

  return result;
}

// --- Server Factory ---

export default function createServer({
  config,
}: {
  config: z.infer<typeof configSchema>;
}) {
  const server = new McpServer({
    name: "IEEE Xplore Research Assistant",
    version: "1.0.0",
  });

  const apiKey = config.IEEE_API_KEY;
  const authToken = config.IEEE_AUTH_TOKEN;

  // --- Tool 1: search_papers ---
  server.registerTool(
    "search_papers",
    {
      title: "Search IEEE Xplore papers",
      description:
        "Full-text search across IEEE Xplore with Boolean operators (AND, OR, NOT) and filters for author, year, content type, open access, and more.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        querytext: z.string().describe("Search query with optional Boolean operators (AND, OR, NOT)"),
        author: z.string().optional().describe("Filter by author name"),
        article_title: z.string().optional().describe("Search within article titles"),
        abstract: z.string().optional().describe("Search within abstracts"),
        index_terms: z.string().optional().describe("Search index terms/keywords"),
        doi: z.string().optional().describe("Search by DOI"),
        publication_title: z.string().optional().describe("Filter by journal/conference name"),
        publication_year: z.string().optional().describe("Exact publication year (YYYY)"),
        start_year: z.string().optional().describe("Start year for range filter (YYYY)"),
        end_year: z.string().optional().describe("End year for range filter (YYYY)"),
        content_type: z.string().optional().describe("Content type: Conferences, Journals, Early Access, Standards, Books, Courses"),
        open_access: z.boolean().optional().describe("Filter for open access papers only"),
        start_record: z.number().optional().default(1).describe("Starting record for pagination (default: 1)"),
        max_records: z.number().optional().default(25).describe("Max records to return, up to 200 (default: 25)"),
        sort_field: z.string().optional().describe("Sort field: article_number, article_title, author, publication_title, publication_year"),
        sort_order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
      },
    },
    async (params) => {
      try {
        const queryParams: Record<string, string> = {
          querytext: params.querytext,
          start_record: String(params.start_record ?? 1),
          max_records: String(params.max_records ?? 25),
        };

        if (params.author) queryParams.author = params.author;
        if (params.article_title) queryParams.article_title = params.article_title;
        if (params.abstract) queryParams.abstract = params.abstract;
        if (params.index_terms) queryParams.index_terms = params.index_terms;
        if (params.doi) queryParams.doi = params.doi;
        if (params.publication_title) queryParams.publication_title = params.publication_title;
        if (params.publication_year) queryParams.publication_year = params.publication_year;
        if (params.start_year) queryParams.start_year = params.start_year;
        if (params.end_year) queryParams.end_year = params.end_year;
        if (params.content_type) queryParams.content_type = params.content_type;
        if (params.open_access) queryParams.open_access = "True";
        if (params.sort_field) queryParams.sort_field = params.sort_field;
        if (params.sort_order) queryParams.sort_order = params.sort_order;

        const data = await ieeeRequest(apiKey, queryParams);
        const text = formatSearchResults(data, params.querytext);
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool 2: get_paper_details ---
  server.registerTool(
    "get_paper_details",
    {
      title: "Get IEEE paper details",
      description:
        "Retrieve detailed metadata for a specific IEEE paper by article number or DOI, including authors, affiliations, abstract, and keywords.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        article_number: z.string().optional().describe("IEEE article number"),
        doi: z.string().optional().describe("Paper DOI"),
      },
    },
    async (params) => {
      try {
        if (!params.article_number && !params.doi) {
          return {
            content: [{ type: "text", text: "Error: Provide either article_number or doi." }],
            isError: true,
          };
        }

        const queryParams: Record<string, string> = { max_records: "1" };
        if (params.article_number) queryParams.article_number = params.article_number;
        if (params.doi) queryParams.doi = params.doi;

        const data = await ieeeRequest(apiKey, queryParams);

        if (!data.articles || data.articles.length === 0) {
          return {
            content: [{ type: "text", text: "No paper found with the given identifier." }],
          };
        }

        const text = formatArticle(data.articles[0], true);
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool 3: get_paper_citations ---
  server.registerTool(
    "get_paper_citations",
    {
      title: "Get IEEE paper citation counts",
      description:
        "Retrieve citation counts (papers and patents) for a specific IEEE paper.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        article_number: z.string().optional().describe("IEEE article number"),
        doi: z.string().optional().describe("Paper DOI"),
      },
    },
    async (params) => {
      try {
        if (!params.article_number && !params.doi) {
          return {
            content: [{ type: "text", text: "Error: Provide either article_number or doi." }],
            isError: true,
          };
        }

        const queryParams: Record<string, string> = { max_records: "1" };
        if (params.article_number) queryParams.article_number = params.article_number;
        if (params.doi) queryParams.doi = params.doi;

        const data = await ieeeRequest(apiKey, queryParams);

        if (!data.articles || data.articles.length === 0) {
          return {
            content: [{ type: "text", text: "No paper found with the given identifier." }],
          };
        }

        const article = data.articles[0];
        const text =
          `**${article.title}**\n` +
          `Paper citations: ${article.citing_paper_count ?? 0}\n` +
          `Patent citations: ${article.citing_patent_count ?? 0}\n`;

        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool 4: get_full_text ---
  server.registerTool(
    "get_full_text",
    {
      title: "Get IEEE paper full text",
      description:
        "Retrieve the full text of an IEEE paper. Works for open access papers; paywalled content requires IEEE_AUTH_TOKEN.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        article_number: z.string().describe("IEEE article number (required for full text)"),
      },
    },
    async (params) => {
      try {
        const text = await ieeeFullTextRequest(apiKey, params.article_number, authToken);

        if (!text) {
          return {
            content: [{ type: "text", text: "No full text content available for this article." }],
          };
        }

        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool 5: search_by_author ---
  server.registerTool(
    "search_by_author",
    {
      title: "Search IEEE papers by author",
      description:
        "Search for IEEE papers by a specific author, with optional year and content type filters.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        author: z.string().describe("Author name to search for"),
        start_year: z.string().optional().describe("Start year filter (YYYY)"),
        end_year: z.string().optional().describe("End year filter (YYYY)"),
        content_type: z.string().optional().describe("Content type filter"),
        publication_title: z.string().optional().describe("Filter by journal/conference"),
        start_record: z.number().optional().default(1).describe("Starting record (default: 1)"),
        max_records: z.number().optional().default(25).describe("Max records (default: 25)"),
        sort_field: z.string().optional().describe("Sort field"),
        sort_order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
      },
    },
    async (params) => {
      try {
        const queryParams: Record<string, string> = {
          author: params.author,
          querytext: params.author,
          start_record: String(params.start_record ?? 1),
          max_records: String(params.max_records ?? 25),
        };

        if (params.start_year) queryParams.start_year = params.start_year;
        if (params.end_year) queryParams.end_year = params.end_year;
        if (params.content_type) queryParams.content_type = params.content_type;
        if (params.publication_title) queryParams.publication_title = params.publication_title;
        if (params.sort_field) queryParams.sort_field = params.sort_field;
        if (params.sort_order) queryParams.sort_order = params.sort_order;

        const data = await ieeeRequest(apiKey, queryParams);
        const text = formatSearchResults(data, `author: ${params.author}`);
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // --- Tool 6: search_by_publication ---
  server.registerTool(
    "search_by_publication",
    {
      title: "Search IEEE papers by publication",
      description:
        "Search for papers within a specific IEEE journal or conference proceedings.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        publication_title: z.string().describe("Journal or conference name"),
        querytext: z.string().optional().describe("Additional search query within the publication"),
        start_year: z.string().optional().describe("Start year filter (YYYY)"),
        end_year: z.string().optional().describe("End year filter (YYYY)"),
        start_record: z.number().optional().default(1).describe("Starting record (default: 1)"),
        max_records: z.number().optional().default(25).describe("Max records (default: 25)"),
        sort_field: z.string().optional().describe("Sort field"),
        sort_order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
      },
    },
    async (params) => {
      try {
        const queryParams: Record<string, string> = {
          publication_title: params.publication_title,
          querytext: params.querytext || params.publication_title,
          start_record: String(params.start_record ?? 1),
          max_records: String(params.max_records ?? 25),
        };

        if (params.start_year) queryParams.start_year = params.start_year;
        if (params.end_year) queryParams.end_year = params.end_year;
        if (params.sort_field) queryParams.sort_field = params.sort_field;
        if (params.sort_order) queryParams.sort_order = params.sort_order;

        const data = await ieeeRequest(apiKey, queryParams);
        const text = formatSearchResults(data, `publication: ${params.publication_title}`);
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}
