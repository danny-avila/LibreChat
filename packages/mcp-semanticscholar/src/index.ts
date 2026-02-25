#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import axios from "axios";
import {
  searchPapers,
  matchPaper,
  getPaper,
  getPaperCitations,
  getPaperReferences,
  getPapersBatch,
  searchAuthors,
  getAuthor,
  getAuthorPapers,
} from "./lib/api/semanticScholar/endpoints.js";
import { createFilter } from "./lib/api/semanticScholar/filters.js";
import { Paper, Author } from "./lib/api/semanticScholar/types.js";
import semanticScholarClient from "./lib/api/semanticScholar/client.js";

// Import and configure pdfjs-dist once
let pdfjsLib: any = null;

// Initialize pdfjs-dist with proper output suppression
async function initPdfJs() {
  if (pdfjsLib) return pdfjsLib;

  // Set up DOM polyfills for Node.js environment
  const DOMMatrixModule = await import("@thednp/dommatrix");
  (global as any).DOMMatrix = DOMMatrixModule.default;

  // Ensure Promise.withResolvers is available (polyfill if needed)
  if (!Promise.withResolvers) {
    (Promise as any).withResolvers = function () {
      let resolve, reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  // Suppress ALL output during import
  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalError = console.error;
  const originalStdout = process.stdout.write.bind(process.stdout);
  const originalStderr = process.stderr.write.bind(process.stderr);

  console.warn = () => {};
  console.log = () => {};
  console.error = () => {};
  process.stdout.write = () => true;
  process.stderr.write = () => true;

  try {
    pdfjsLib = await import("pdfjs-dist");
  } finally {
    // Restore outputs
    console.warn = originalWarn;
    console.log = originalLog;
    console.error = originalError;
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }

  return pdfjsLib;
}

const app = express();
const PORT = process.env.PORT || 8081;

// CORS configuration for browser-based MCP clients
app.use(
  cors({
    origin: "*", // Configure appropriately for production
    exposedHeaders: ["Mcp-Session-Id", "mcp-protocol-version"],
    allowedHeaders: ["Content-Type", "mcp-session-id"],
  })
);

app.use(express.json());

/**
 * Well-Known Endpoint for MCP Configuration Schema
 * Required for Smithery to detect configuration options
 * See: https://smithery.ai/docs/build/session-config
 */
app.get("/.well-known/mcp-config", (req: Request, res: Response) => {
  const schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: `${req.protocol}://${req.get("host")}/.well-known/mcp-config`,
    title: "Semantic Scholar MCP Configuration",
    description: "Configuration for connecting to the Semantic Scholar MCP server",
    "x-query-style": "dot+bracket",
    type: "object",
    properties: {
      SEMANTIC_SCHOLAR_API_KEY: {
        type: "string",
        title: "Semantic Scholar API Key",
        description: "Your Semantic Scholar API key for enhanced rate limits and access",
      },
      WILEY_TDM_CLIENT_TOKEN: {
        type: "string",
        title: "Wiley TDM Client Token",
        description: "Your Wiley TDM Client Token for downloading full-text papers",
      },
      debug: {
        type: "boolean",
        title: "Debug Mode",
        default: false,
        description: "Enable debug logging for troubleshooting",
      },
    },
    required: [],
    additionalProperties: false,
  };

  res.json(schema);
});

/**
 * Semantic Scholar MCP Server
 *
 * This server provides access to the Semantic Scholar Academic Graph,
 * allowing AI models to search for papers, authors, and analyze citation networks.
 *
 * The server exposes resources, tools, and prompts for interacting with academic literature.
 */
export const configSchema = z.object({
  SEMANTIC_SCHOLAR_API_KEY: z
    .string()
    .optional()
    .describe("Your Semantic Scholar API key for enhanced rate limits and access"),
  WILEY_TDM_CLIENT_TOKEN: z
    .string()
    .optional()
    .describe("Your Wiley TDM Client Token for downloading full-text papers"),
  debug: z.boolean().default(false).describe("Enable debug logging for troubleshooting"),
});

// Parse configuration from HTTP request query parameters
function parseConfig(req: Request): any {
  try {
    const configParam = req.query.config as string;
    if (configParam) {
      const configJson = Buffer.from(configParam, "base64").toString();
      const parsedConfig = JSON.parse(configJson);

      return parsedConfig;
    }

    // No config parameter found, will use environment variables
    return {};
  } catch (error) {
    console.error("Error parsing config from HTTP request:", error);
    return {};
  }
}

export default function createServer({
  config,
}: {
  config: z.infer<typeof configSchema>;
}) {
  const server = new McpServer({
    name: "AI Research Assistant",
    version: "1.0.0",
    capabilities: {
      tools: {},
      logging: {},
    },
  });

  /**
   * Enhanced logging system that uses MCP logging capabilities when available
   * Falls back to console logging if server is not ready or logging is not supported
   */
  const logError = (message: string, data?: any) => {
    try {
      // Try to send a proper MCP logging message
      server.sendLoggingMessage({
        level: "error",
        logger: "semantic-scholar",
        data: {
          message,
          timestamp: new Date().toISOString(),
          ...(data && { details: data }),
        },
      });
    } catch (err) {
      // Fallback to console logging if MCP logging not supported
      if (config.debug) {
        console.error(`[MCP ERROR] ${message}`, data);
      }
    }
  };

  const logWarning = (message: string, data?: any) => {
    try {
      server.sendLoggingMessage({
        level: "warning",
        logger: "semantic-scholar",
        data: {
          message,
          timestamp: new Date().toISOString(),
          ...(data && { details: data }),
        },
      });
    } catch (err) {
      if (config.debug) {
        console.warn(`[MCP WARNING] ${message}`, data);
      }
    }
  };

  const logInfo = (message: string, data?: any) => {
    try {
      server.sendLoggingMessage({
        level: "info",
        logger: "semantic-scholar",
        data: {
          message,
          timestamp: new Date().toISOString(),
          ...(data && { details: data }),
        },
      });
    } catch (err) {
      if (config.debug) {
        console.log(`[MCP INFO] ${message}`, data);
      }
    }
  };

  /**
   * Helper Functions
   *
   * These functions format data from the Semantic Scholar API into
   * human-readable text for display in the MCP tools and resources.
   */

  /**
   * Format a paper object into a readable string
   */
  const formatPaper = (paper: Paper): string => {
    let result = `Title: ${paper.title}\n`;
    if (paper.authors && paper.authors.length > 0) {
      result += `Authors: ${paper.authors.map((a) => a.name).join(", ")}\n`;
    }
    if (paper.year) {
      result += `Year: ${paper.year}\n`;
    }
    if (paper.venue) {
      result += `Venue: ${paper.venue}\n`;
    }
    if (paper.publicationVenue?.name) {
      result += `Publisher: ${paper.publicationVenue.name}\n`;
    }
    if (paper.externalIds?.DOI) {
      result += `DOI: ${paper.externalIds.DOI}\n`;
    }
    if (paper.citationCount !== undefined) {
      result += `Citations: ${paper.citationCount}\n`;
    }
    if (paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0) {
      result += `Fields of Study: ${paper.fieldsOfStudy.join(", ")}\n`;
    }
    if (paper.abstract) {
      result += `\nAbstract: ${paper.abstract}\n`;
    }
    if (paper.url) {
      result += `\nURL: ${paper.url}\n`;
    }
    if (paper.isOpenAccess) {
      result += `Open Access: Yes\n`;
      if (paper.openAccessPdf?.url) {
        result += `PDF: ${paper.openAccessPdf.url}\n`;
      }
    }
    return result;
  };

  /**
   * Format an author object into a readable string
   */
  const formatAuthor = (author: Author): string => {
    let result = `Name: ${author.name}\n`;
    if (author.affiliations && author.affiliations.length > 0) {
      result += `Affiliations: ${author.affiliations.join(", ")}\n`;
    }
    if (author.paperCount !== undefined) {
      result += `Papers: ${author.paperCount}\n`;
    }
    if (author.citationCount !== undefined) {
      result += `Citations: ${author.citationCount}\n`;
    }
    if (author.hIndex !== undefined) {
      result += `h-index: ${author.hIndex}\n`;
    }
    if (author.url) {
      result += `URL: ${author.url}\n`;
    }
    return result;
  };

  /**
   * TOOLS
   *
   * These tools provide functionality for searching and analyzing academic literature.
   * They are organized into categories for easier discovery and use.
   */

  /**
   * Paper Search and Retrieval Tools
   *
   * These tools allow searching for papers, retrieving paper details,
   * and finding papers by title match.
   */

  /**
   * Basic paper search with just a query and limit
   */
  server.registerTool(
    "papers-search-basic",
    {
      title: "basic search for papers",
      description: "Search for academic papers with a simple query.",
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.9,
      },
      inputSchema: {
        query: z.string().describe("Search query for papers"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of results to return"),
      },
    },
    async ({ query, limit }) => {
      try {
        const filter = createFilter(query)
          .withFields([
            "paperId",
            "title",
            "abstract",
            "authors",
            "year",
            "venue",
            "publicationVenue",
            "externalIds",
            "citationCount",
            "url",
            "isOpenAccess",
          ])
          .withPagination(0, limit || 10);

        const results = await searchPapers(filter);

        let response = "";

        // Show pagination info at the beginning
        if (results.next) {
          response += `**Note: More results available. To see the next page, use offset=${results.next} in your query.**\n\n`;
        }

        response += `Found ${results.total} papers matching "${query}"\n\n`;

        if (results.data.length === 0) {
          response += "No papers found matching your criteria.";
        } else {
          results.data.forEach((paper, index) => {
            response += `${index + 1}. ${paper.title} (${
              paper.year || "N/A"
            })\n`;
            if (paper.authors && paper.authors.length > 0) {
              response += `   Authors: ${paper.authors
                .map((a) => a.name)
                .join(", ")}\n`;
            }
            if (paper.venue) {
              response += `   Venue: ${paper.venue}\n`;
            }
            if (paper.publicationVenue?.name) {
              response += `   Publisher: ${paper.publicationVenue.name}\n`;
            }
            if (paper.citationCount !== undefined) {
              response += `   Citations: ${paper.citationCount}\n`;
            }
            if (paper.url) {
              response += `   URL: ${paper.url}\n`;
            }
            if (paper.externalIds) {
              response += `   DOI: ${paper.externalIds.DOI}\n`;
            }
            response += "\n";
          });

          if (results.next) {
            response += `\n**To see more results, use offset=${results.next} in your next query.**`;
          }
        }

        return {
          content: [{ type: "text", text: response }],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logError("Error in papers-search-basic tool", {
          query,
          limit,
          error: errorMessage,
        });
        return {
          content: [
            {
              type: "text",
              text: `Error searching papers: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Advanced paper search with multiple filters
   */
  server.registerTool(
    "paper-search-advanced",
    {
      title: "advanced search for papers",
      description: "Search for academic papers with advanced filtering options",
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.8,
      },
      inputSchema: {
        query: z.string().describe("Search query for papers"),
        yearStart: z
          .number()
          .optional()
          .describe("Starting year for filtering (inclusive)"),
        yearEnd: z
          .number()
          .optional()
          .describe("Ending year for filtering (inclusive)"),
        minCitations: z
          .number()
          .optional()
          .describe("Minimum number of citations"),
        openAccessOnly: z
          .boolean()
          .optional()
          .describe("Only include open access papers"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of results to return"),
        fieldsOfStudy: z
          .array(z.string())
          .optional()
          .describe("Fields of study to filter by"),
        publicationTypes: z
          .array(z.string())
          .optional()
          .describe("Publication types to filter by"),
        sortBy: z
          .enum(["relevance", "citationCount", "year"])
          .optional()
          .default("relevance")
          .describe("Field to sort by"),
        sortOrder: z
          .enum(["asc", "desc"])
          .optional()
          .default("desc")
          .describe("Sort order"),
      },
    },
    async ({
      query,
      yearStart,
      yearEnd,
      minCitations,
      openAccessOnly,
      limit,
      fieldsOfStudy,
      publicationTypes,
      sortBy,
      sortOrder,
    }: {
      query: string;
      yearStart?: number;
      yearEnd?: number;
      minCitations?: number;
      openAccessOnly?: boolean;
      limit?: number;
      fieldsOfStudy?: string[];
      publicationTypes?: string[];
      sortBy?: "relevance" | "citationCount" | "year";
      sortOrder?: "asc" | "desc";
    }) => {
      try {
        const filter = createFilter(query)
          .withFields([
            "paperId",
            "title",
            "abstract",
            "authors",
            "year",
            "venue",
            "publicationVenue",
            "externalIds",
            "citationCount",
            "url",
            "isOpenAccess",
          ])
          .withPagination(0, limit || 10);

        if (yearStart !== undefined || yearEnd !== undefined) {
          filter.withYearRange(yearStart, yearEnd);
        }

        if (minCitations !== undefined) {
          filter.withMinCitations(minCitations);
        }

        if (openAccessOnly) {
          filter.withOpenAccessOnly();
        }

        if (fieldsOfStudy && fieldsOfStudy.length > 0) {
          filter.withFieldsOfStudy(fieldsOfStudy);
        }

        if (publicationTypes && publicationTypes.length > 0) {
          filter.withPublicationTypes(publicationTypes);
        }

        if (sortBy) {
          filter.withSort(sortBy, sortOrder || "desc");
        }

        const results = await searchPapers(filter);

        let response = "";

        // Show pagination info at the beginning
        if (results.next) {
          response += `**Note: More results available. To see the next page, use offset=${results.next} in your query.**\n\n`;
        }

        response += `Found ${results.total} papers matching "${query}"\n\n`;

        if (results.data.length === 0) {
          response += "No papers found matching your criteria.";
        } else {
          results.data.forEach((paper, index) => {
            response += `${index + 1}. ${paper.title} (${
              paper.year || "N/A"
            })\n`;
            if (paper.authors && paper.authors.length > 0) {
              response += `   Authors: ${paper.authors
                .map((a) => a.name)
                .join(", ")}\n`;
            }
            if (paper.venue) {
              response += `   Venue: ${paper.venue}\n`;
            }
            if (paper.publicationVenue?.name) {
              response += `   Publisher: ${paper.publicationVenue.name}\n`;
            }
            if (paper.citationCount !== undefined) {
              response += `   Citations: ${paper.citationCount}\n`;
            }
            if (paper.url) {
              response += `   URL: ${paper.url}\n`;
            }
            if (paper.externalIds) {
              response += `   DOI: ${paper.externalIds.DOI}\n`;
            }

            if (paper.isOpenAccess) {
              response += `   Open Access: Yes\n`;
            }
            response += "\n";
          });

          if (results.next) {
            response += `\n**To see more results, use offset=${results.next} in your next query.**`;
          }
        }

        return {
          content: [{ type: "text", text: response }],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logError("Error in papers-search-advanced tool", {
          query,
          error: errorMessage,
        });
        return {
          content: [
            {
              type: "text",
              text: `Error searching papers: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Find a paper by closest title match
   */
  server.registerTool(
    "search-paper-title",
    {
      title: "search for a specific paper",
      description: "Find a paper by closest title match",
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.85,
      },
      inputSchema: {
        title: z.string().describe("Paper title to match"),
        yearStart: z
          .number()
          .optional()
          .describe("Starting year for filtering (inclusive)"),
        yearEnd: z
          .number()
          .optional()
          .describe("Ending year for filtering (inclusive)"),
        minCitations: z
          .number()
          .optional()
          .describe("Minimum number of citations"),
        openAccessOnly: z
          .boolean()
          .optional()
          .describe("Only include open access papers"),
      },
    },
    async ({
      title,
      yearStart,
      yearEnd,
      minCitations,
      openAccessOnly,
    }: {
      title: string;
      yearStart?: number;
      yearEnd?: number;
      minCitations?: number;
      openAccessOnly?: boolean;
    }) => {
      try {
        const filter = createFilter(title).withFields([
          "paperId",
          "title",
          "abstract",
          "authors",
          "year",
          "venue",
          "publicationVenue",
          "externalIds",
          "citationCount",
          "url",
          "isOpenAccess",
        ]);

        if (yearStart !== undefined || yearEnd !== undefined) {
          filter.withYearRange(yearStart, yearEnd);
        }

        if (minCitations !== undefined) {
          filter.withMinCitations(minCitations);
        }

        if (openAccessOnly) {
          filter.withOpenAccessOnly();
        }

        const matchParams = filter.buildMatchParams();
        const paper = await matchPaper(matchParams);

        // Debug: Check what we actually got back
        if (!paper || !paper.title) {
          logError("Paper match returned incomplete data", paper);
          return {
            content: [
              {
                type: "text",
                text: `Error: Paper match endpoint returned incomplete data. Please try a more specific search query.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: formatPaper(paper),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logError("Error in search-paper-title tool", {
          title,
          error: errorMessage,
        });
        return {
          content: [
            {
              type: "text",
              text: `Error matching paper: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Get detailed information about a specific paper
   */
  server.registerTool(
    "get-paper-abstract",
    {
      title: "read abstract",
      description:
        "Get detailed information about a specific paper including its abstract",
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.9,
      },
      inputSchema: {
        paperId: z
          .string()
          .describe("Paper ID (Semantic Scholar ID, arXiv ID, DOI, etc.)"),
      },
    },
    async ({ paperId }) => {
      try {
        const paper = await getPaper({
          paperId,
          fields:
            "paperId,title,abstract,year,venue,publicationVenue,externalIds,citationCount,authors,url,isOpenAccess,openAccessPdf,fieldsOfStudy",
        });

        return {
          content: [{ type: "text", text: formatPaper(paper) }],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logError("Error in paper-get tool", { paperId, error: errorMessage });
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving paper details: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Get papers that cite a specific paper
   */
  server.registerTool(
    "papers-citations",
    {
      title: "review paper citations",
      description: "Get papers that cite a specific paper",
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.8,
      },
      inputSchema: {
        paperId: z
          .string()
          .describe("Paper ID (Semantic Scholar ID, arXiv ID, DOI, etc.)"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of citations to return"),
        offset: z
          .number()
          .optional()
          .default(0)
          .describe("Offset for pagination"),
      },
    },
    async ({ paperId, limit, offset }) => {
      try {
        const citations = await getPaperCitations(
          { paperId },
          {
            offset: offset || 0,
            limit: limit || 10,
            fields:
              "paperId,title,abstract,year,venue,publicationVenue,citationCount,authors,url,isOpenAccess,contexts,isInfluential",
          }
        );

        let response = "";

        // Show pagination info at the beginning
        if (citations.next) {
          response += `**Note: More citations available. To see the next page, use offset=${citations.next} in your query.**\n\n`;
        }

        response += `Citations for paper ID ${paperId}:\n\n`;

        if (citations.data.length === 0) {
          response += "No citations found.";
        } else {
          citations.data.forEach((citation, index) => {
            response += `${index + 1}. ${citation.citingPaper.title} (${
              citation.citingPaper.year || "N/A"
            })\n`;
            if (
              citation.citingPaper.authors &&
              citation.citingPaper.authors.length > 0
            ) {
              response += `   Authors: ${citation.citingPaper.authors
                .map((a) => a.name)
                .join(", ")}\n`;
            }
            if (citation.isInfluential) {
              response += `   Influential: Yes\n`;
            }
            if (citation.citingPaper.url) {
              response += `   URL: ${citation.citingPaper.url}\n`;
            }
            response += "\n";
          });

          if (citations.next) {
            response += `\n**To see more citations, use offset=${citations.next} in your next query.**`;
          }
        }

        return {
          content: [{ type: "text", text: response }],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logError("Error in paper-citations tool", {
          paperId,
          error: errorMessage,
        });
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving citations: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Get papers cited by a specific paper
   */
  server.registerTool(
    "papers-references",
    {
      title: "review paper references",
      description: "Get papers cited by a specific paper",
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.8,
      },
      inputSchema: {
        paperId: z
          .string()
          .describe("Paper ID (Semantic Scholar ID, arXiv ID, DOI, etc.)"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of references to return"),
        offset: z
          .number()
          .optional()
          .default(0)
          .describe("Offset for pagination"),
      },
    },
    async ({ paperId, limit, offset }) => {
      try {
        const references = await getPaperReferences(
          { paperId },
          {
            offset: offset || 0,
            limit: limit || 10,
            fields:
              "paperId,title,abstract,year,venue,publicationVenue,citationCount,authors,url,isOpenAccess,contexts,isInfluential",
          }
        );

        let response = "";

        // Show pagination info at the beginning
        if (references.next) {
          response += `**Note: More references available. To see the next page, use offset=${references.next} in your query.**\n\n`;
        }

        response += `References for paper ID ${paperId}:\n\n`;

        if (references.data.length === 0) {
          response += "No references found.";
        } else {
          references.data.forEach((reference, index) => {
            response += `${index + 1}. ${reference.citedPaper.title} (${
              reference.citedPaper.year || "N/A"
            })\n`;
            if (
              reference.citedPaper.authors &&
              reference.citedPaper.authors.length > 0
            ) {
              response += `   Authors: ${reference.citedPaper.authors
                .map((a) => a.name)
                .join(", ")}\n`;
            }
            if (reference.isInfluential) {
              response += `   Influential: Yes\n`;
            }
            if (reference.citedPaper.url) {
              response += `   URL: ${reference.citedPaper.url}\n`;
            }
            response += "\n";
          });

          if (references.next) {
            response += `\n**To see more references, use offset=${references.next} in your next query.**`;
          }
        }

        return {
          content: [{ type: "text", text: response }],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logError("Error in paper-references tool", {
          paperId,
          error: errorMessage,
        });
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving references: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Search for authors by name or affiliation
   */
  server.registerTool(
    "authors-search",
    {
      title: "search authors",
      description: "Search for authors by name or affiliation",
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.7,
      },
      inputSchema: {
        query: z.string().describe("Search query for authors"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of results to return"),
        offset: z
          .number()
          .optional()
          .default(0)
          .describe("Offset for pagination"),
      },
    },
    async ({ query, limit, offset }) => {
      try {
        const results = await searchAuthors({
          query,
          offset: offset || 0,
          limit: limit || 10,
          fields:
            "authorId,name,affiliations,paperCount,citationCount,hIndex,url",
        });

        let response = "";

        // Show pagination info at the beginning
        if (results.next) {
          response += `**Note: More authors available. To see the next page, use offset=${results.next} in your query.**\n\n`;
        }

        response += `Found ${results.total} authors matching "${query}"\n\n`;

        if (results.data.length === 0) {
          response += "No authors found matching your criteria.";
        } else {
          results.data.forEach((author, index) => {
            response += `${index + 1}. ${author.name}\n`;
            if (author.affiliations && author.affiliations.length > 0) {
              response += `   Affiliations: ${author.affiliations.join(
                ", "
              )}\n`;
            }
            if (author.paperCount !== undefined) {
              response += `   Papers: ${author.paperCount}\n`;
            }
            if (author.citationCount !== undefined) {
              response += `   Citations: ${author.citationCount}\n`;
            }
            if (author.hIndex !== undefined) {
              response += `   h-index: ${author.hIndex}\n`;
            }
            if (author.url) {
              response += `   URL: ${author.url}\n`;
            }
            response += "\n";
          });

          if (results.next) {
            response += `\n**To see more authors, use offset=${results.next} in your next query.**`;
          }
        }

        return {
          content: [{ type: "text", text: response }],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logError("Error in author-search tool", {
          query,
          limit,
          error: errorMessage,
        });
        return {
          content: [
            {
              type: "text",
              text: `Error searching authors: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Get papers written by a specific author
   */
  server.registerTool(
    "authors-papers",
    {
      title: "search author's papers",
      description: "Get papers written by a specific author",
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.75,
      },
      inputSchema: {
        authorId: z.string().describe("Author ID"),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of papers to return"),
        offset: z
          .number()
          .optional()
          .default(0)
          .describe("Offset for pagination"),
      },
    },
    async ({ authorId, limit, offset }) => {
      try {
        const papers = await getAuthorPapers(
          { authorId },
          {
            offset: offset || 0,
            limit: limit || 10,
            fields:
              "paperId,title,abstract,year,venue,publicationVenue,citationCount,authors,url,isOpenAccess",
          }
        );

        let response = "";

        // Show pagination info at the beginning
        if (papers.next) {
          response += `**Note: More papers available. To see the next page, use offset=${papers.next} in your query.**\n\n`;
        }

        response += `Papers by author ID ${authorId}:\n\n`;

        if (papers.data.length === 0) {
          response += "No papers found.";
        } else {
          papers.data.forEach((paper, index) => {
            response += `${index + 1}. ${paper.title} (${
              paper.year || "N/A"
            })\n`;
            if (paper.venue) {
              response += `   Venue: ${paper.venue}\n`;
            }
            if (paper.publicationVenue?.name) {
              response += `   Publisher: ${paper.publicationVenue.name}\n`;
            }
            if (paper.citationCount !== undefined) {
              response += `   Citations: ${paper.citationCount}\n`;
            }
            if (paper.url) {
              response += `   URL: ${paper.url}\n`;
            }
            response += "\n";
          });

          if (papers.next) {
            response += `\n**To see more papers, use offset=${papers.next} in your next query.**`;
          }
        }

        return {
          content: [{ type: "text", text: response }],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logError("Error in author-papers tool", {
          authorId,
          limit,
          error: errorMessage,
        });
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving author papers: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Look up multiple papers by their IDs
   */
  server.registerTool(
    "papers-batch",
    {
      title: "look up multiple papers by their IDs",
      description: "Look up multiple papers by their IDs",
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.6,
      },
      inputSchema: {
        paperIds: z
          .array(z.string())
          .describe(
            "Array of paper IDs (Semantic Scholar IDs, arXiv IDs, DOIs, etc.)"
          ),
      },
    },
    async ({ paperIds }) => {
      try {
        if (paperIds.length === 0) {
          return {
            content: [{ type: "text", text: "No paper IDs provided." }],
            isError: true,
          };
        }

        if (paperIds.length > 500) {
          return {
            content: [
              { type: "text", text: "Too many paper IDs. Maximum is 500." },
            ],
            isError: true,
          };
        }

        const papers = await getPapersBatch({
          ids: paperIds,
          // fields: "paperId,title,abstract,year,venue,citationCount,authors,url,isOpenAccess"
          fields: "title,authors,citations.title,citations.abstract",
        });

        let response = `Batch lookup results for ${paperIds.length} papers:\n\n`;

        if (papers.length === 0) {
          response += "No papers found.";
        } else {
          papers.forEach((paper, index) => {
            if (!paper) {
              response += `${index + 1}. [Not found]\n\n`;
              return;
            }

            response += `${index + 1}. ${paper.title} (${
              paper.year || "N/A"
            })\n`;
            if (paper.authors && paper.authors.length > 0) {
              response += `   Authors: ${paper.authors
                .map((a) => a.name)
                .join(", ")}\n`;
            }
            if (paper.venue) {
              response += `   Venue: ${paper.venue}\n`;
            }
            if (paper.publicationVenue?.name) {
              response += `   Publisher: ${paper.publicationVenue.name}\n`;
            }
            if (paper.citationCount !== undefined) {
              response += `   Citations: ${paper.citationCount}\n`;
            }
            if (paper.url) {
              response += `   URL: ${paper.url}\n`;
            }
            response += "\n";
          });
        }

        return {
          content: [{ type: "text", text: response }],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logError("Error in batch-paper-lookup tool", {
          paperCount: paperIds.length,
          error: errorMessage,
        });
        return {
          content: [
            {
              type: "text",
              text: `Error in batch paper lookup: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Download full-text PDF from Wiley and convert to text
   * Only register this tool if WILEY_TDM_CLIENT_TOKEN is configured
   */
  if (config.WILEY_TDM_CLIENT_TOKEN) {
    server.registerTool(
      "download-full-paper-wiley",
      {
        title: "download full-text PDF from Wiley",
        description:
          "Download full-text PDF of a Wiley paper using its DOI and extract text content (memory only)",
        annotations: {
          audience: ["user", "assistant"],
          priority: 0.5,
        },
        inputSchema: {
          doi: z
            .string()
            .describe(
              "DOI of the paper to download (e.g., 10.1111/1467-923X.12168)"
            ),
        },
      },
      async ({ doi }) => {
        try {
          // Token is guaranteed to be available since tool is only registered when configured
          // Encode DOI for URL (replace / with %2F)
          const encodedDoi = encodeURIComponent(doi);
          const downloadUrl = `https://api.wiley.com/onlinelibrary/tdm/v1/articles/${encodedDoi}`;

          // Make request with Wiley token - Wiley always returns PDFs
          const response = await axios.get(downloadUrl, {
            headers: {
              "Wiley-TDM-Client-Token": config.WILEY_TDM_CLIENT_TOKEN,
              Accept: "application/pdf",
            },
            responseType: "arraybuffer",
            maxRedirects: 5, // Follow redirects as required by Wiley
            timeout: 60000, // 60 second timeout for large files
          });

          // Buffer the entire response in memory
          const pdfBuffer = Buffer.from(response.data);

          // Extract text using pdfjs-dist (Mozilla's PDF.js library)
          try {
            // Get or initialize pdfjs with suppressed output
            const pdfjs = await initPdfJs();

            // Suppress warnings during PDF processing
            const originalWarn = console.warn;
            const originalLog = console.log;
            const originalError = console.error;
            const originalStdout = process.stdout.write.bind(process.stdout);
            const originalStderr = process.stderr.write.bind(process.stderr);

            console.warn = () => {};
            console.log = () => {};
            console.error = () => {};
            process.stdout.write = () => true;
            process.stderr.write = () => true;

            // Convert Buffer to Uint8Array as required by pdfjs-dist
            const uint8Array = new Uint8Array(pdfBuffer);

            // Load PDF from Uint8Array
            const loadingTask = pdfjs.getDocument({ data: uint8Array });
            const pdfDoc = await loadingTask.promise;

            let extractedText = "";

            // Extract text from all pages
            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
              const page = await pdfDoc.getPage(pageNum);
              const textContent = await page.getTextContent();

              // Combine text items from the page
              const pageText = textContent.items
                .map((item: any) => item.str)
                .join(" ");

              extractedText += pageText + "\n\n";
            }

            // Restore outputs before processing results
            console.warn = originalWarn;
            console.log = originalLog;
            console.error = originalError;
            process.stdout.write = originalStdout;
            process.stderr.write = originalStderr;

            // Clean up the extracted text
            const cleanText = extractedText.trim();

            if (!cleanText || cleanText.length < 50) {
              return {
                content: [
                  {
                    type: "text",
                    text:
                      `PDF downloaded successfully but contains minimal text content.\n` +
                      `This may be a scanned PDF or contain mostly images.\n` +
                      `Extracted content length: ${cleanText.length} characters`,
                  },
                ],
              };
            }

            // Return the extracted text
            return {
              content: [
                {
                  type: "text",
                  text: cleanText,
                },
              ],
            };
          } catch (parseError) {
            const parseErrorMessage =
              parseError instanceof Error
                ? parseError.message
                : String(parseError);
            logError("Failed to extract text from PDF", {
              doi,
              error: parseErrorMessage,
            });
            return {
              content: [
                {
                  type: "text",
                  text:
                    `PDF download succeeded but text extraction failed.\n` +
                    `Error: ${parseErrorMessage}`,
                },
              ],
              isError: true,
            };
          }
        } catch (error) {
          // Handle specific Wiley API errors
          if (axios.isAxiosError(error)) {
            if (error.response?.status === 400) {
              logError("Wiley API bad request", { doi, status: 400 });
              return {
                content: [
                  {
                    type: "text",
                    text:
                      "Error 400: Bad request to Wiley API.\n\n" +
                      "This may indicate:\n" +
                      "- The TDM Client Token format is incorrect\n" +
                      "- The DOI format is invalid\n" +
                      "- There's an issue with the request headers\n\n" +
                      "Please verify your token is correctly configured and the DOI is valid.",
                  },
                ],
                isError: true,
              };
            }
            if (error.response?.status === 403) {
              logError("Invalid Wiley TDM Client Token", { doi, status: 403 });
              return {
                content: [
                  {
                    type: "text",
                    text:
                      "Error 403: The Wiley TDM Client Token is invalid or not registered.\n\n" +
                      "Your token may be:\n" +
                      "- Incorrectly formatted\n" +
                      "- Expired or revoked\n" +
                      "- Not properly registered with Wiley\n\n" +
                      "Please visit https://onlinelibrary.wiley.com/library-info/resources/text-and-datamining " +
                      "to verify your token or obtain a new one.",
                  },
                ],
                isError: true,
              };
            }
            if (error.response?.status === 404) {
              return {
                content: [
                  {
                    type: "text",
                    text:
                      `Error 404: Access denied for DOI ${doi}\n\n` +
                      "This means:\n" +
                      "- Your institution doesn't have a subscription to this content\n" +
                      "- The content is not open access\n" +
                      "- The DOI may be incorrect or the article doesn't exist\n\n" +
                      "Contact your institution's library to verify access rights or check if " +
                      "alternative versions of the paper are available through other sources.",
                  },
                ],
                isError: true,
              };
            }
            if (error.response?.status === 429) {
              logError("Wiley API rate limit exceeded", { doi, status: 429 });
              return {
                content: [
                  {
                    type: "text",
                    text:
                      "Error 429: Rate limit exceeded\n\n" +
                      "Wiley's API limits are:\n" +
                      "- Maximum 3 articles per second\n" +
                      "- Maximum 60 requests per 10 minutes\n\n" +
                      "Please wait before making additional requests. Consider implementing " +
                      "delays between requests to stay within the rate limits.",
                  },
                ],
                isError: true,
              };
            }
          }

          return {
            content: [
              {
                type: "text",
                text: `Error downloading paper: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  /**
   * Search arXiv for papers
   */
  server.registerTool(
    "search-arxiv",
    {
      title: "search arXiv.org for papers",
      description: "Search for papers on arXiv using their API",
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.85,
      },
      inputSchema: {
        query: z.string().describe("Search query for arXiv papers"),
        searchType: z
          .enum([
            "all",
            "title",
            "author",
            "abstract",
            "comment",
            "journal",
            "category",
            "id",
          ])
          .optional()
          .default("all")
          .describe("Type of search to perform"),
        maxResults: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of results to return (max 100)"),
        start: z
          .number()
          .optional()
          .default(0)
          .describe("Starting index for pagination"),
        sortBy: z
          .enum(["relevance", "lastUpdatedDate", "submittedDate"])
          .optional()
          .default("relevance")
          .describe("Sort order for results"),
        sortOrder: z
          .enum(["ascending", "descending"])
          .optional()
          .default("descending")
          .describe("Sort direction"),
      },
    },
    async ({ query, searchType, maxResults, start, sortBy, sortOrder }) => {
      try {
        // Construct the search query based on searchType
        let searchQuery = "";
        if (searchType === "id") {
          // For ID search, use id_list parameter instead
          searchQuery = "";
        } else if (searchType === "all") {
          searchQuery = `all:${query}`;
        } else {
          searchQuery = `${searchType}:${query}`;
        }

        // Build the API URL
        const baseUrl = "http://export.arxiv.org/api/query";
        const params = new URLSearchParams();

        if (searchType === "id") {
          params.append("id_list", query);
        } else {
          params.append("search_query", searchQuery);
        }

        params.append("start", start.toString());
        params.append("max_results", Math.min(maxResults, 100).toString());

        // Add sorting parameters
        if (sortBy !== "relevance") {
          params.append("sortBy", sortBy);
          params.append("sortOrder", sortOrder);
        }

        const url = `${baseUrl}?${params.toString()}`;

        // Make the API request
        const response = await axios.get(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; MCP-SemanticScholar/1.0)",
          },
          timeout: 30000,
        });

        // Parse the Atom feed response
        const feedData = response.data;

        // Extract total results count
        const totalMatch = feedData.match(
          /<opensearch:totalResults>(\d+)<\/opensearch:totalResults>/
        );
        const totalResults = totalMatch ? parseInt(totalMatch[1]) : 0;

        // Extract entries using regex
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        const entries = [];
        let match;

        while ((match = entryRegex.exec(feedData)) !== null) {
          const entryXml = match[1];

          // Extract paper information
          const idMatch = entryXml.match(/<id>([^<]+)<\/id>/);
          const titleMatch = entryXml.match(/<title>([^<]+)<\/title>/);
          const summaryMatch = entryXml.match(/<summary>([\s\S]*?)<\/summary>/);
          const publishedMatch = entryXml.match(
            /<published>([^<]+)<\/published>/
          );
          const updatedMatch = entryXml.match(/<updated>([^<]+)<\/updated>/);

          // Extract authors
          const authorRegex = /<author>\s*<name>([^<]+)<\/name>/g;
          const authors = [];
          let authorMatch;
          while ((authorMatch = authorRegex.exec(entryXml)) !== null) {
            authors.push(authorMatch[1].trim());
          }

          // Extract categories
          const categoryRegex = /<category[^>]*term="([^"]+)"/g;
          const categories = [];
          let categoryMatch;
          while ((categoryMatch = categoryRegex.exec(entryXml)) !== null) {
            categories.push(categoryMatch[1]);
          }

          // Extract primary category
          const primaryCategoryMatch = entryXml.match(
            /<arxiv:primary_category[^>]*term="([^"]+)"/
          );

          // Extract comment if exists
          const commentMatch = entryXml.match(
            /<arxiv:comment[^>]*>([\s\S]*?)<\/arxiv:comment>/
          );

          // Extract journal reference if exists
          const journalMatch = entryXml.match(
            /<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/
          );

          // Extract DOI if exists
          const doiMatch = entryXml.match(
            /<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/
          );

          // Extract PDF link
          const pdfMatch = entryXml.match(
            /<link[^>]*title="pdf"[^>]*href="([^"]+)"/
          );

          // Clean up the abstract
          const abstractText = summaryMatch
            ? summaryMatch[1]
                .replace(/\s+/g, " ")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&amp;/g, "&")
                .trim()
            : "";

          // Extract arXiv ID from the URL
          const arxivId = idMatch ? idMatch[1].split("/abs/").pop() : "";

          // Create clean paper object
          const paper = {
            arxivId: arxivId,
            title: titleMatch ? titleMatch[1].trim() : "",
            authors: authors,
            abstract: abstractText,
            categories: categories,
            primaryCategory: primaryCategoryMatch
              ? primaryCategoryMatch[1]
              : categories[0] || "",
            published: publishedMatch ? publishedMatch[1] : "",
            updated: updatedMatch ? updatedMatch[1] : "",
            doi: doiMatch ? doiMatch[1].trim() : null,
            journalRef: journalMatch ? journalMatch[1].trim() : null,
            comment: commentMatch ? commentMatch[1].trim() : null,
            pdfUrl: pdfMatch ? pdfMatch[1] : `https://arxiv.org/pdf/${arxivId}`,
            abstractUrl: idMatch ? idMatch[1] : "",
          };

          entries.push(paper);
        }

        // Create response object
        const result = {
          query: query,
          searchType: searchType,
          totalResults: totalResults,
          startIndex: start,
          itemsPerPage: entries.length,
          papers: entries,
        };

        // Format response for display
        let responseText = `arXiv Search Results\n`;
        responseText += `===================\n\n`;
        responseText += `Query: "${query}" (${searchType})\n`;
        responseText += `Total Results: ${totalResults}\n`;
        responseText += `Showing: ${start + 1}-${
          start + entries.length
        } of ${totalResults}\n\n`;

        if (entries.length === 0) {
          responseText += "No papers found matching your query.\n";
        } else {
          entries.forEach((paper, index) => {
            responseText += `${start + index + 1}. ${paper.title}\n`;
            responseText += `   arXiv ID: ${paper.arxivId}\n`;
            responseText += `   Authors: ${paper.authors.join(", ")}\n`;
            responseText += `   Categories: ${paper.categories.join(", ")}\n`;
            responseText += `   Published: ${new Date(
              paper.published
            ).toLocaleDateString()}\n`;
            if (paper.updated !== paper.published) {
              responseText += `   Updated: ${new Date(
                paper.updated
              ).toLocaleDateString()}\n`;
            }
            if (paper.doi) {
              responseText += `   DOI: ${paper.doi}\n`;
            }
            if (paper.journalRef) {
              responseText += `   Journal: ${paper.journalRef}\n`;
            }
            responseText += `   PDF: ${paper.pdfUrl}\n`;
            responseText += `   URL: ${paper.abstractUrl}\n`;
            if (paper.abstract) {
              responseText += `   Abstract: ${paper.abstract.substring(
                0,
                200
              )}${paper.abstract.length > 200 ? "..." : ""}\n`;
            }
            responseText += "\n";
          });

          if (totalResults > start + entries.length) {
            responseText += `\nTo see more results, use start=${
              start + entries.length
            } in your next query.`;
          }
        }

        // Also return the structured data as JSON for programmatic use
        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
          // Include structured data for potential future use
          metadata: result,
        };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 400) {
            logError("arXiv bad request", { query, status: 400 });
            return {
              content: [
                {
                  type: "text",
                  text: `Error 400: Bad Request\n\nThe arXiv API returned an error. This usually means the search query was malformed.\nPlease check your query syntax and try again.`,
                },
              ],
              isError: true,
            };
          }
          if (error.code === "ECONNABORTED") {
            logError("arXiv search timeout", { query, code: "ECONNABORTED" });
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Request timeout\n\nThe request to arXiv API timed out. Please try again with fewer results or a simpler query.`,
                },
              ],
              isError: true,
            };
          }
        }

        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logError("Error in search-arxiv tool", { query, error: errorMessage });
        return {
          content: [
            {
              type: "text",
              text: `Error searching arXiv: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Download full-text PDF from arXiv and convert to text
   */
  server.registerTool(
    "download-full-paper-arxiv",
    {
      title: "download full-text PDF from arXiv.org",
      description:
        "Download full-text PDF of an arXiv paper and extract text content (memory only)",
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.5,
      },
      inputSchema: {
        arxivId: z
          .string()
          .describe(
            "arXiv ID of the paper to download (e.g., 2301.12345, hep-ex/0307015, or with version 2301.12345v2)"
          ),
      },
    },
    async ({ arxivId }) => {
      try {
        // Clean the arXiv ID - remove any URL prefixes if present
        let cleanId = arxivId;
        if (arxivId.includes("arxiv.org/abs/")) {
          cleanId = arxivId.split("arxiv.org/abs/").pop() || arxivId;
        }
        if (arxivId.includes("arxiv.org/pdf/")) {
          cleanId = arxivId.split("arxiv.org/pdf/").pop() || arxivId;
        }
        // Remove .pdf extension if present
        if (cleanId.endsWith(".pdf")) {
          cleanId = cleanId.slice(0, -4);
        }

        // Construct the PDF URL using export.arxiv.org for programmatic access
        const downloadUrl = `https://export.arxiv.org/pdf/${cleanId}`;

        // Download the PDF - arXiv recommends 4 requests per second max
        const response = await axios.get(downloadUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; MCP-SemanticScholar/1.0)",
            Accept: "application/pdf",
          },
          responseType: "arraybuffer",
          maxRedirects: 5,
          timeout: 60000, // 60 second timeout for large files
        });

        // Buffer the entire response in memory
        const pdfBuffer = Buffer.from(response.data);

        // Extract text using pdfjs-dist (Mozilla's PDF.js library)
        try {
          // Get or initialize pdfjs with suppressed output
          const pdfjs = await initPdfJs();

          // Suppress warnings during PDF processing
          const originalWarn = console.warn;
          const originalLog = console.log;
          const originalError = console.error;
          const originalStdout = process.stdout.write.bind(process.stdout);
          const originalStderr = process.stderr.write.bind(process.stderr);

          console.warn = () => {};
          console.log = () => {};
          console.error = () => {};
          process.stdout.write = () => true;
          process.stderr.write = () => true;

          // Convert Buffer to Uint8Array as required by pdfjs-dist
          const uint8Array = new Uint8Array(pdfBuffer);

          // Load PDF from Uint8Array
          const loadingTask = pdfjs.getDocument({ data: uint8Array });
          const pdfDoc = await loadingTask.promise;

          let extractedText = "";

          // Extract text from all pages
          for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Combine text items from the page
            const pageText = textContent.items
              .map((item: any) => item.str)
              .join(" ");

            extractedText += pageText + "\n\n";
          }

          // Restore outputs before processing results
          console.warn = originalWarn;
          console.log = originalLog;
          console.error = originalError;
          process.stdout.write = originalStdout;
          process.stderr.write = originalStderr;

          // Clean up the extracted text
          const cleanText = extractedText.trim();

          if (!cleanText || cleanText.length < 50) {
            return {
              content: [
                {
                  type: "text",
                  text:
                    `PDF downloaded successfully but contains minimal text content.\n` +
                    `This may be a scanned PDF or contain mostly images.\n` +
                    `Extracted content length: ${cleanText.length} characters`,
                },
              ],
            };
          }

          // Return the extracted text with arXiv info
          return {
            content: [
              {
                type: "text",
                text: `arXiv Paper ID: ${cleanId}\nSource: ${downloadUrl}\n\n${cleanText}`,
              },
            ],
          };
        } catch (parseError) {
          const parseErrorMessage =
            parseError instanceof Error
              ? parseError.message
              : String(parseError);
          logError("Failed to extract text from PDF (arXiv)", {
            arxivId,
            error: parseErrorMessage,
          });
          return {
            content: [
              {
                type: "text",
                text:
                  `PDF download succeeded but text extraction failed.\n` +
                  `Error: ${parseErrorMessage}`,
              },
            ],
            isError: true,
          };
        }
      } catch (error) {
        // Handle specific arXiv errors
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 404) {
            logError("arXiv paper not found", { arxivId, status: 404 });
            return {
              content: [
                {
                  type: "text",
                  text:
                    `Error 404: arXiv paper not found\n\n` +
                    `The arXiv ID '${arxivId}' could not be found.\n` +
                    `Please check:\n` +
                    `- The ID format is correct (e.g., 2301.12345 or hep-ex/0307015)\n` +
                    `- The paper exists on arXiv\n` +
                    `- Try without version suffix if you included one (e.g., use 2301.12345 instead of 2301.12345v2)`,
                },
              ],
              isError: true,
            };
          }
          if (error.response?.status === 429) {
            logError("arXiv API rate limit exceeded", { arxivId, status: 429 });
            return {
              content: [
                {
                  type: "text",
                  text:
                    "Error 429: Rate limit exceeded\n\n" +
                    "arXiv rate limits:\n" +
                    "- Maximum 4 requests per second\n" +
                    "- Use export.arxiv.org for programmatic access\n\n" +
                    "Please wait a moment before making additional requests.",
                },
              ],
              isError: true,
            };
          }
          if (error.code === "ECONNABORTED") {
            logError("arXiv download timeout", {
              arxivId,
              code: "ECONNABORTED",
            });
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Request timeout\n\nThe request to download arXiv paper '${arxivId}' timed out. The file may be very large or the server may be slow.`,
                },
              ],
              isError: true,
            };
          }
        }

        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logError("Error in download-full-paper-arxiv tool", {
          arxivId,
          error: errorMessage,
        });
        return {
          content: [
            {
              type: "text",
              text: `Error downloading arXiv paper: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * Analyze the citation network for a specific paper
   */
  server.registerTool(
    "analysis-citation-network",
    {
      title: "analyze paper citation network",
      description: "Analyze the citation network for a specific paper",
      annotations: {
        audience: ["user", "assistant"],
        priority: 0.7,
      },
      inputSchema: {
        paperId: z
          .string()
          .describe("Paper ID (Semantic Scholar ID, arXiv ID, DOI, etc.)"),
        depth: z
          .string()
          .optional()
          .describe("Depth of citation network (1 or 2)"),
        citationsLimit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of citations to analyze per paper"),
        referencesLimit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of references to analyze per paper"),
      },
    },
    async ({ paperId, depth, citationsLimit, referencesLimit }) => {
      try {
        // Get the main paper
        const paper = await getPaper({
          paperId,
          fields: "paperId,title,year,authors,citationCount,venue",
        });

        // Get citations
        const citations = await getPaperCitations(
          { paperId },
          {
            limit: citationsLimit || 10,
            fields: "paperId,title,year,authors,citationCount,isInfluential",
          }
        );

        // Get references
        const references = await getPaperReferences(
          { paperId },
          {
            limit: referencesLimit || 10,
            fields: "paperId,title,year,authors,citationCount,isInfluential",
          }
        );

        let response = `Citation Network Analysis for "${paper.title}" (${
          paper.year || "N/A"
        })\n\n`;

        // Main paper info
        response += `Main Paper: ${paper.title} (${paper.year || "N/A"})\n`;
        if (paper.authors && paper.authors.length > 0) {
          response += `Authors: ${paper.authors
            .map((a) => a.name)
            .join(", ")}\n`;
        }
        if (paper.venue) {
          response += `Venue: ${paper.venue}\n`;
        }
        if (paper.citationCount !== undefined) {
          response += `Citation Count: ${paper.citationCount}\n`;
        }
        response += "\n";

        // Citations analysis
        response += `PAPERS THAT CITE THIS PAPER (${citations.data.length}):\n\n`;

        if (citations.data.length === 0) {
          response += "No citations found.\n\n";
        } else {
          // Count influential citations
          const influentialCount = citations.data.filter(
            (c) => c.isInfluential
          ).length;
          response += `Influential Citations: ${influentialCount} of ${
            citations.data.length
          } (${Math.round(
            (influentialCount / citations.data.length) * 100
          )}%)\n\n`;

          // List top citations
          citations.data
            .sort(
              (a, b) =>
                (b.citingPaper.citationCount || 0) -
                (a.citingPaper.citationCount || 0)
            )
            .slice(0, 5)
            .forEach((citation, index) => {
              response += `${index + 1}. ${citation.citingPaper.title} (${
                citation.citingPaper.year || "N/A"
              })\n`;
              if (
                citation.citingPaper.authors &&
                citation.citingPaper.authors.length > 0
              ) {
                response += `   Authors: ${citation.citingPaper.authors
                  .map((a) => a.name)
                  .join(", ")}\n`;
              }
              if (citation.citingPaper.citationCount !== undefined) {
                response += `   Citations: ${citation.citingPaper.citationCount}\n`;
              }
              if (citation.isInfluential) {
                response += `   Influential: Yes\n`;
              }
              response += "\n";
            });
        }

        // References analysis
        response += `PAPERS CITED BY THIS PAPER (${references.data.length}):\n\n`;

        if (references.data.length === 0) {
          response += "No references found.\n\n";
        } else {
          // Count influential references
          const influentialCount = references.data.filter(
            (r) => r.isInfluential
          ).length;
          response += `Influential References: ${influentialCount} of ${
            references.data.length
          } (${Math.round(
            (influentialCount / references.data.length) * 100
          )}%)\n\n`;

          // List top references
          references.data
            .sort(
              (a, b) =>
                (b.citedPaper.citationCount || 0) -
                (a.citedPaper.citationCount || 0)
            )
            .slice(0, 5)
            .forEach((reference, index) => {
              response += `${index + 1}. ${reference.citedPaper.title} (${
                reference.citedPaper.year || "N/A"
              })\n`;
              if (
                reference.citedPaper.authors &&
                reference.citedPaper.authors.length > 0
              ) {
                response += `   Authors: ${reference.citedPaper.authors
                  .map((a) => a.name)
                  .join(", ")}\n`;
              }
              if (reference.citedPaper.citationCount !== undefined) {
                response += `   Citations: ${reference.citedPaper.citationCount}\n`;
              }
              if (reference.isInfluential) {
                response += `   Influential: Yes\n`;
              }
              response += "\n";
            });
        }

        // Second-level analysis if depth > 1
        if (depth && depth === "2") {
          // Get the most influential citation
          const topCitation = citations.data
            .sort(
              (a, b) =>
                (b.citingPaper.citationCount || 0) -
                (a.citingPaper.citationCount || 0)
            )
            .find((c) => c.isInfluential);

          if (topCitation) {
            response += `SECOND-LEVEL ANALYSIS: Papers that cite the most influential citation\n\n`;

            try {
              const secondLevelCitations = await getPaperCitations(
                { paperId: topCitation.citingPaper.paperId },
                {
                  limit: 5,
                  fields:
                    "paperId,title,year,authors,citationCount,isInfluential",
                }
              );

              if (secondLevelCitations.data.length === 0) {
                response += "No second-level citations found.\n\n";
              } else {
                secondLevelCitations.data
                  .sort(
                    (a, b) =>
                      (b.citingPaper.citationCount || 0) -
                      (a.citingPaper.citationCount || 0)
                  )
                  .forEach((citation, index) => {
                    response += `${index + 1}. ${citation.citingPaper.title} (${
                      citation.citingPaper.year || "N/A"
                    })\n`;
                    if (
                      citation.citingPaper.authors &&
                      citation.citingPaper.authors.length > 0
                    ) {
                      response += `   Authors: ${citation.citingPaper.authors
                        .map((a) => a.name)
                        .join(", ")}\n`;
                    }
                    if (citation.citingPaper.citationCount !== undefined) {
                      response += `   Citations: ${citation.citingPaper.citationCount}\n`;
                    }
                    response += "\n";
                  });
              }
            } catch (error) {
              response += `Error retrieving second-level citations: ${
                error instanceof Error ? error.message : String(error)
              }\n\n`;
            }
          }
        }

        return {
          content: [{ type: "text", text: response }],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logError("Error in analyze-citation-network tool", {
          paperId,
          error: errorMessage,
        });
        return {
          content: [
            {
              type: "text",
              text: `Error analyzing citation network: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Handle POST requests for client-to-server communication
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    // Check for existing session ID
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New initialization request
      // Parse configuration from HTTP request
      const rawConfig = parseConfig(req);

      // Parse and validate configuration with schema
      const config = configSchema.parse({
        SEMANTIC_SCHOLAR_API_KEY:
          rawConfig.SEMANTIC_SCHOLAR_API_KEY ||
          process.env.SEMANTIC_SCHOLAR_API_KEY ||
          undefined,
        WILEY_TDM_CLIENT_TOKEN:
          rawConfig.WILEY_TDM_CLIENT_TOKEN ||
          process.env.WILEY_TDM_CLIENT_TOKEN ||
          undefined,
        debug: rawConfig.debug || false,
      });

      // Set API key on the semantic scholar client
      if (config.SEMANTIC_SCHOLAR_API_KEY) {
        semanticScholarClient.defaults.headers.common["x-api-key"] =
          config.SEMANTIC_SCHOLAR_API_KEY;
      }

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          // Store the transport by session ID
          transports[sessionId] = transport;
        },
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
      };

      const server = createServer({ config });

      // Connect to the MCP server
      await server.connect(transport);
    } else {
      // Invalid request
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      });
      return;
    }

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

// Handle GET requests for server-to-client notifications via SSE
app.get("/mcp", handleSessionRequest);

// Handle DELETE requests for session termination
app.delete("/mcp", handleSessionRequest);

// Main function to start the server in HTTP mode
async function main() {
  // Run in HTTP mode
  app.listen(PORT, () => {
    console.log(`MCP HTTP Server listening on port ${PORT}`);
  });
}

// Start the server
main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
