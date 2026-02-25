import axios from "axios";
import semanticScholarClient from "./client.js";
import { sanitizeQuery } from "./filters.js";
import {
  PaperParams,
  SearchParams,
  AuthorParams,
  PaginationParams,
  PaperBulkSearchParams,
  PaperBatchParams,
  AuthorBatchParams,
  PaperMatchResult,
  PaperSearchResult,
  AuthorSearchResult,
  PaperBulkSearchResult,
  Paper,
  Author,
  Citation,
  Reference,
  MatchParams,
} from "./types.js";
import { FilterBuilder } from "./filters.js";

/**
 * Helper function to build query parameters
 * Handles different parameter types including arrays, booleans, and primitives
 */
const buildQueryParams = <T extends Record<string, unknown>>(
  params: T
): string => {
  const queryParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (typeof value === "boolean" && value) {
        // Handle boolean flags (like openAccessPdf)
        queryParams.append(key, "");
      } else if (Array.isArray(value)) {
        // Handle array values by joining with commas
        queryParams.append(key, value.join(","));
      } else {
        queryParams.append(key, String(value));
      }
    }
  });

  return queryParams.toString();
};

// Paper endpoints
/**
 * Search for papers using the Semantic Scholar API
 * @param params SearchParams object or FilterBuilder instance
 * @returns Promise with PaperSearchResult
 * @throws Error with specific message for API errors
 */
export const searchPapers = async (
  params: SearchParams | FilterBuilder
): Promise<PaperSearchResult> => {
  const finalParams = params instanceof FilterBuilder ? params.build() : params;

  // Sanitize query for paper/search endpoint (replace hyphens with spaces)
  if (finalParams.query) {
    finalParams.query = sanitizeQuery(finalParams.query);
  }

  const queryString = buildQueryParams(finalParams);

  try {
    const response = await semanticScholarClient.get(
      `/paper/search?${queryString}`
    );
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error(
          "Rate limit exceeded (1 request/second for /paper/search). Please try again later."
        );
      }
      if (error.response?.status === 403) {
        throw new Error(
          "403 Forbidden: Invalid or missing Semantic Scholar API key. Please check your SEMANTIC_SCHOLAR_API_KEY configuration."
        );
      }
      if (error.response?.status === 401) {
        throw new Error(
          "401 Unauthorized: Authentication failed. Please verify your Semantic Scholar API key."
        );
      }
      if (error.response?.status === 400) {
        const errorMsg =
          error.response.data.error || "Invalid search parameters";
        throw new Error(`API Error: ${errorMsg}`);
      }
      if (error.response?.status === 404) {
        throw new Error("Resource not found");
      }
      if (error.response?.status === 500) {
        throw new Error("Semantic Scholar API server error");
      }
    }
    throw error;
  }
};

/**
 * Search for papers in bulk using the Semantic Scholar API
 * @param params PaperBulkSearchParams object
 * @returns Promise with PaperBulkSearchResult
 * @throws Error with specific message for API errors
 */
export const searchPapersBulk = async (
  params: PaperBulkSearchParams
): Promise<PaperBulkSearchResult> => {
  const queryString = buildQueryParams(params);

  try {
    const response = await semanticScholarClient.get(
      `/paper/search/bulk?${queryString}`
    );
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error(
          "Rate limit exceeded (10 requests/second). Please try again later."
        );
      }
      if (error.response?.status === 403) {
        throw new Error(
          "403 Forbidden: Invalid or missing Semantic Scholar API key. Please check your SEMANTIC_SCHOLAR_API_KEY configuration."
        );
      }
      if (error.response?.status === 401) {
        throw new Error(
          "401 Unauthorized: Authentication failed. Please verify your Semantic Scholar API key."
        );
      }
      if (error.response?.status === 400) {
        const errorMsg =
          error.response.data.error || "Invalid bulk search parameters";
        throw new Error(`API Error: ${errorMsg}`);
      }
      if (error.response?.status === 404) {
        throw new Error("Resource not found");
      }
      if (error.response?.status === 500) {
        throw new Error("Semantic Scholar API server error");
      }
    }
    throw error;
  }
};

/**
 * Match a paper by title using the Semantic Scholar API
 * Returns a single paper that is the closest title match to the given query
 * @param params MatchParams object containing query and optional fields
 * @returns Promise with PaperMatchResult
 * @throws Error with specific message for API errors
 */
export const matchPaper = async (
  params: MatchParams
): Promise<PaperMatchResult> => {
  // Extract query parameter for special handling
  const { query, ...otherParams } = params;

  if (!query) {
    throw new Error("Query parameter is required for paper match");
  }

  // Encode the query parameter separately to ensure proper handling of special characters
  const encodedQuery = encodeURIComponent(query);

  // Build query string for other parameters
  const otherParamsString = buildQueryParams(otherParams);

  // Construct the final URL with the encoded query parameter
  const url = `/paper/search/match?query=${encodedQuery}${
    otherParamsString ? `&${otherParamsString}` : ""
  }`;

  try {
    const response = await semanticScholarClient.get(url);

    // Validate response structure
    if (!response.data || typeof response.data !== "object") {
      throw new Error("Invalid response format from paper match endpoint");
    }

    // The match endpoint returns a data array with the best match
    if (response.data.data && Array.isArray(response.data.data)) {
      if (response.data.data.length === 0) {
        throw new Error("No matching paper found");
      }
      // Return the first (best) match
      return response.data.data[0];
    }

    // Fallback for unexpected response format
    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error(
          "Rate limit exceeded for paper match endpoint. Please try again later."
        );
      }
      if (error.response?.status === 403) {
        throw new Error(
          "403 Forbidden: Invalid or missing Semantic Scholar API key. Please check your SEMANTIC_SCHOLAR_API_KEY configuration."
        );
      }
      if (error.response?.status === 401) {
        throw new Error(
          "401 Unauthorized: Authentication failed. Please verify your Semantic Scholar API key."
        );
      }
      if (error.response?.status === 400) {
        const errorMsg =
          error.response.data.error || "Invalid match parameters";
        throw new Error(`API Error: ${errorMsg}`);
      }
      if (error.response?.status === 404) {
        throw new Error("Title match not found");
      }
      if (error.response?.status === 500) {
        throw new Error("Semantic Scholar API server error");
      }

      // Handle other error cases
      if (error.response) {
        throw new Error(
          `API Error (${error.response.status}): ${
            error.response.data?.error || error.message
          }`
        );
      } else if (error.request) {
        throw new Error(
          `Network Error: No response received - ${error.message}`
        );
      }
    }

    // Re-throw unknown errors
    throw error;
  }
};

/**
 * Get details for a specific paper using the Semantic Scholar API
 * Supports various ID formats including Semantic Scholar ID, DOI, arXiv, etc.
 *
 * @param params PaperParams object containing paperId and optional fields
 * @returns Promise with Paper object
 * @throws Error with specific message for API errors
 *
 * @example
 * // Get paper with default fields (paperId and title)
 * const paper = await getPaper({ paperId: '649def34f8be52c8b66281af98ae884c09aef38b' });
 *
 * @example
 * // Get paper with specific fields
 * const paper = await getPaper({
 *   paperId: 'DOI:10.18653/v1/N18-3011',
 *   fields: 'url,year,authors'
 * });
 *
 * @example
 * // Get paper with nested fields
 * const paper = await getPaper({
 *   paperId: 'ARXIV:2106.15928',
 *   fields: 'title,authors,citations.title,citations.authors'
 * });
 */
export const getPaper = async ({
  paperId,
  fields,
}: PaperParams): Promise<Paper> => {
  if (!paperId) {
    throw new Error("Paper ID is required");
  }

  // Validate paper ID format if needed
  // The API supports various ID formats: S2 ID, DOI, arXiv, etc.

  // Build query string for fields parameter
  const queryParams = fields ? buildQueryParams({ fields }) : "";
  const url = `/paper/${encodeURIComponent(paperId)}${
    queryParams ? `?${queryParams}` : ""
  }`;

  try {
    const response = await semanticScholarClient.get(url);

    // Validate response structure
    if (!response.data || typeof response.data !== "object") {
      throw new Error("Invalid response format from paper endpoint");
    }

    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error(
          "Rate limit exceeded for paper endpoint. Please try again later."
        );
      }
      if (error.response?.status === 403) {
        throw new Error(
          "403 Forbidden: Invalid or missing Semantic Scholar API key. Please check your SEMANTIC_SCHOLAR_API_KEY configuration."
        );
      }
      if (error.response?.status === 401) {
        throw new Error(
          "401 Unauthorized: Authentication failed. Please verify your Semantic Scholar API key."
        );
      }
      if (error.response?.status === 400) {
        const errorMsg =
          error.response.data.error || "Invalid paper parameters";
        throw new Error(`API Error: ${errorMsg}`);
      }
      if (error.response?.status === 404) {
        throw new Error(`Paper with ID '${paperId}' not found`);
      }
      if (error.response?.status === 500) {
        throw new Error("Semantic Scholar API server error");
      }

      // Handle response size limit error
      if (
        error.response?.status === 413 ||
        (error.response?.data?.error &&
          error.response.data.error.includes("exceed maximum size"))
      ) {
        throw new Error(
          "Response exceeds maximum size (10 MB). Try requesting fewer fields."
        );
      }

      // Handle other error cases
      if (error.response) {
        throw new Error(
          `API Error (${error.response.status}): ${
            error.response.data?.error || error.message
          }`
        );
      } else if (error.request) {
        throw new Error(
          `Network Error: No response received - ${error.message}`
        );
      }
    }

    // Re-throw unknown errors
    throw error;
  }
};

/**
 * Get citations for a specific paper using the Semantic Scholar API
 *
 * @param paperParams PaperParams object containing paperId
 * @param paginationParams PaginationParams object for pagination and fields
 * @returns Promise with Citation data, offset, and next page token
 * @throws Error with specific message for API errors
 *
 * @example
 * // Get citations with default pagination
 * const citations = await getPaperCitations(
 *   { paperId: '649def34f8be52c8b66281af98ae884c09aef38b' }
 * );
 *
 * @example
 * // Get citations with custom pagination and fields
 * const citations = await getPaperCitations(
 *   { paperId: 'DOI:10.18653/v1/N18-3011' },
 *   { offset: 0, limit: 50, fields: 'contexts,intents,citingPaper.title' }
 * );
 */
export const getPaperCitations = async (
  { paperId }: PaperParams,
  { offset = 0, limit = 100, fields }: PaginationParams
): Promise<{ data: Citation[]; offset: number; next?: number }> => {
  if (!paperId) {
    throw new Error("Paper ID is required");
  }

  // Validate limit (API maximum is 1000)
  if (limit > 1000) {
    console.warn("Limit exceeds maximum of 1000. Setting to 1000.");
    limit = 1000;
  }

  // Build query parameters
  const queryParams = buildQueryParams({ offset, limit, fields });
  const url = `/paper/${encodeURIComponent(paperId)}/citations?${queryParams}`;

  try {
    const response = await semanticScholarClient.get(url);

    // Validate response structure
    if (!response.data || !Array.isArray(response.data.data)) {
      throw new Error("Invalid response format from citations endpoint");
    }

    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error(
          "Rate limit exceeded for citations endpoint. Please try again later."
        );
      }
      if (error.response?.status === 403) {
        throw new Error(
          "403 Forbidden: Invalid or missing Semantic Scholar API key. Please check your SEMANTIC_SCHOLAR_API_KEY configuration."
        );
      }
      if (error.response?.status === 401) {
        throw new Error(
          "401 Unauthorized: Authentication failed. Please verify your Semantic Scholar API key."
        );
      }
      if (error.response?.status === 400) {
        const errorMsg =
          error.response.data.error || "Invalid citation parameters";
        throw new Error(`API Error: ${errorMsg}`);
      }
      if (error.response?.status === 404) {
        throw new Error(`Paper with ID '${paperId}' not found`);
      }
      if (error.response?.status === 500) {
        throw new Error("Semantic Scholar API server error");
      }

      // Handle response size limit error
      if (
        error.response?.status === 413 ||
        (error.response?.data?.error &&
          error.response.data.error.includes("exceed maximum size"))
      ) {
        throw new Error(
          "Response exceeds maximum size (10 MB). Try requesting fewer fields or reducing the limit."
        );
      }

      // Handle other error cases
      if (error.response) {
        throw new Error(
          `API Error (${error.response.status}): ${
            error.response.data?.error || error.message
          }`
        );
      } else if (error.request) {
        throw new Error(
          `Network Error: No response received - ${error.message}`
        );
      }
    }

    // Re-throw unknown errors
    throw error;
  }
};

/**
 * Get references for a specific paper using the Semantic Scholar API
 *
 * @param paperParams PaperParams object containing paperId
 * @param paginationParams PaginationParams object for pagination and fields
 * @returns Promise with Reference data, offset, and next page token
 * @throws Error with specific message for API errors
 *
 * @example
 * // Get references with default pagination
 * const references = await getPaperReferences(
 *   { paperId: '649def34f8be52c8b66281af98ae884c09aef38b' }
 * );
 *
 * @example
 * // Get references with custom pagination and fields
 * const references = await getPaperReferences(
 *   { paperId: 'DOI:10.18653/v1/N18-3011' },
 *   { offset: 0, limit: 50, fields: 'contexts,intents,citedPaper.title' }
 * );
 */
export const getPaperReferences = async (
  { paperId }: PaperParams,
  { offset = 0, limit = 100, fields }: PaginationParams
): Promise<{ data: Reference[]; offset: number; next?: number }> => {
  if (!paperId) {
    throw new Error("Paper ID is required");
  }

  // Validate limit (API maximum is 1000)
  if (limit > 1000) {
    console.warn("Limit exceeds maximum of 1000. Setting to 1000.");
    limit = 1000;
  }

  // Build query parameters
  const queryParams = buildQueryParams({ offset, limit, fields });
  const url = `/paper/${encodeURIComponent(paperId)}/references?${queryParams}`;

  try {
    const response = await semanticScholarClient.get(url);

    // Validate response structure
    if (!response.data || !Array.isArray(response.data.data)) {
      throw new Error("Invalid response format from references endpoint");
    }

    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error(
          "Rate limit exceeded for references endpoint. Please try again later."
        );
      }
      if (error.response?.status === 403) {
        throw new Error(
          "403 Forbidden: Invalid or missing Semantic Scholar API key. Please check your SEMANTIC_SCHOLAR_API_KEY configuration."
        );
      }
      if (error.response?.status === 401) {
        throw new Error(
          "401 Unauthorized: Authentication failed. Please verify your Semantic Scholar API key."
        );
      }
      if (error.response?.status === 400) {
        const errorMsg =
          error.response.data.error || "Invalid reference parameters";
        throw new Error(`API Error: ${errorMsg}`);
      }
      if (error.response?.status === 404) {
        throw new Error(`Paper with ID '${paperId}' not found`);
      }
      if (error.response?.status === 500) {
        throw new Error("Semantic Scholar API server error");
      }

      // Handle response size limit error
      if (
        error.response?.status === 413 ||
        (error.response?.data?.error &&
          error.response.data.error.includes("exceed maximum size"))
      ) {
        throw new Error(
          "Response exceeds maximum size (10 MB). Try requesting fewer fields or reducing the limit."
        );
      }

      // Handle other error cases
      if (error.response) {
        throw new Error(
          `API Error (${error.response.status}): ${
            error.response.data?.error || error.message
          }`
        );
      } else if (error.request) {
        throw new Error(
          `Network Error: No response received - ${error.message}`
        );
      }
    }

    // Re-throw unknown errors
    throw error;
  }
};

/**
 * Get details for multiple papers at once using the /paper/batch endpoint
 * @param params PaperBatchParams object containing paper IDs and optional fields
 * @returns Promise with an array of Paper objects
 * @throws Error if the API limits are exceeded or if the API returns an error
 */
export const getPapersBatch = async ({
  ids,
  fields,
}: PaperBatchParams): Promise<Paper[]> => {
  // Validate API limitations
  if (ids.length > 500) {
    throw new Error(
      "Semantic Scholar API can only process 500 paper IDs at a time"
    );
  }

  // Fields is a query parameter, not part of the request body
  const queryParams = fields ? `?fields=${fields}` : "";

  try {
    // Make POST request with IDs in the request body
    const response = await semanticScholarClient.post(
      `/paper/batch${queryParams}`,
      {
        ids: ids,
      }
    );

    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error(
          "Rate limit exceeded (1 request/second for /paper/batch). Please try again later."
        );
      }
      if (error.response?.status === 403) {
        throw new Error(
          "403 Forbidden: Invalid or missing Semantic Scholar API key. Please check your SEMANTIC_SCHOLAR_API_KEY configuration."
        );
      }
      if (error.response?.status === 401) {
        throw new Error(
          "401 Unauthorized: Authentication failed. Please verify your Semantic Scholar API key."
        );
      }
      if (error.response?.status === 400) {
        const errorMsg =
          error.response.data.error || "Invalid batch parameters";
        throw new Error(`API Error: ${errorMsg}`);
      }
      if (error.response?.status === 404) {
        throw new Error("Resource not found");
      }
      if (error.response?.status === 500) {
        throw new Error("Semantic Scholar API server error");
      }
    }
    throw error;
  }
};

/**
 * Get details for multiple papers at once, automatically handling large batches
 * by splitting them into chunks of 500 IDs (the API limit)
 * @param params PaperBatchParams object containing paper IDs and optional fields
 * @returns Promise with an array of Paper objects
 */
export const getPapersBatchChunked = async ({
  ids,
  fields,
}: PaperBatchParams): Promise<Paper[]> => {
  if (ids.length <= 500) {
    return getPapersBatch({ ids, fields });
  }

  // Split IDs into chunks of 500
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 500) {
    chunks.push(ids.slice(i, i + 500));
  }

  // Process each chunk sequentially to respect rate limits
  const results: Paper[] = [];
  for (const chunkIds of chunks) {
    // Process chunk and wait for result
    const chunkResult = await getPapersBatch({ ids: chunkIds, fields });
    results.push(...chunkResult);

    // No need for additional delay since the client interceptor handles rate limiting
  }

  return results;
};

// Author endpoints
/**
 * Search for authors by name using the Semantic Scholar API
 * Specifying papers fields in the request will return all papers linked to each author in the results.
 * Set a limit on the search results to reduce output size and latency.
 *
 * @param params SearchParams object or FilterBuilder instance
 * @returns Promise with AuthorSearchResult containing total, offset, next, and data
 * @throws Error with specific message for API errors
 *
 * @example
 * // Basic search
 * const results = await searchAuthors({ query: 'Adam Smith' });
 *
 * @example
 * // Search with pagination and specific fields
 * const results = await searchAuthors({
 *   query: 'Adam Smith',
 *   limit: 5,
 *   fields: 'name,url,papers.title,papers.year'
 * });
 *
 * @example
 * // Using FilterBuilder
 * const filter = createFilter('Adam Smith')
 *   .withFields(['name', 'affiliations'])
 *   .withPagination(0, 10);
 * const results = await searchAuthors(filter);
 */
export const searchAuthors = async (
  params: SearchParams | FilterBuilder
): Promise<AuthorSearchResult> => {
  const finalParams = params instanceof FilterBuilder ? params.build() : params;

  // Create a copy of params to avoid modifying the original
  const sanitizedParams = { ...finalParams };

  // Validate required parameters
  if (!sanitizedParams.query) {
    throw new Error("Query parameter is required for author search");
  }

  // Validate limit (API maximum is 1000)
  if (sanitizedParams.limit && sanitizedParams.limit > 1000) {
    console.warn("Limit exceeds maximum of 1000. Setting to 1000.");
    sanitizedParams.limit = 1000;
  }

  // Sanitize query for author/search endpoint (replace hyphens with spaces)
  // Hyphenated query terms yield no matches according to the documentation
  sanitizedParams.query = sanitizeQuery(sanitizedParams.query);

  const queryString = buildQueryParams(sanitizedParams);
  const url = `/author/search?${queryString}`;

  try {
    const response = await semanticScholarClient.get(url);

    // Validate response structure
    if (!response.data || !Array.isArray(response.data.data)) {
      throw new Error("Invalid response format from author search endpoint");
    }

    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error(
          "Rate limit exceeded (10 requests/second). Please try again later."
        );
      }
      if (error.response?.status === 403) {
        throw new Error(
          "403 Forbidden: Invalid or missing Semantic Scholar API key. Please check your SEMANTIC_SCHOLAR_API_KEY configuration."
        );
      }
      if (error.response?.status === 401) {
        throw new Error(
          "401 Unauthorized: Authentication failed. Please verify your Semantic Scholar API key."
        );
      }
      if (error.response?.status === 400) {
        const errorMsg =
          error.response.data.error || "Invalid search parameters";
        throw new Error(`API Error: ${errorMsg}`);
      }
      if (error.response?.status === 404) {
        throw new Error("Resource not found");
      }
      if (error.response?.status === 500) {
        throw new Error("Semantic Scholar API server error");
      }

      // Handle response size limit error
      if (
        error.response?.status === 413 ||
        (error.response?.data?.error &&
          error.response.data.error.includes("exceed maximum size"))
      ) {
        throw new Error(
          "Response exceeds maximum size (10 MB). Try requesting fewer fields, reducing the limit, or avoiding papers fields which can be large."
        );
      }

      // Handle other error cases
      if (error.response) {
        throw new Error(
          `API Error (${error.response.status}): ${
            error.response.data?.error || error.message
          }`
        );
      } else if (error.request) {
        throw new Error(
          `Network Error: No response received - ${error.message}`
        );
      }
    }

    // Re-throw unknown errors
    throw error;
  }
};

/**
 * Get details for a specific author using the Semantic Scholar API
 *
 * @param params AuthorParams object containing authorId and optional fields
 * @returns Promise with Author object
 * @throws Error with specific message for API errors
 *
 * @example
 * // Get author with default fields (authorId and name)
 * const author = await getAuthor({ authorId: '1741101' });
 *
 * @example
 * // Get author with specific fields
 * const author = await getAuthor({
 *   authorId: '1741101',
 *   fields: 'url,affiliations,paperCount,citationCount'
 * });
 *
 * @example
 * // Get author with papers and nested fields
 * const author = await getAuthor({
 *   authorId: '1741101',
 *   fields: 'url,papers.abstract,papers.authors'
 * });
 */
export const getAuthor = async ({
  authorId,
  fields,
}: AuthorParams): Promise<Author> => {
  if (!authorId) {
    throw new Error("Author ID is required");
  }

  // Build query string for fields parameter
  const queryParams = fields ? buildQueryParams({ fields }) : "";
  const url = `/author/${encodeURIComponent(authorId)}${
    queryParams ? `?${queryParams}` : ""
  }`;

  try {
    const response = await semanticScholarClient.get(url);

    // Validate response structure
    if (!response.data || typeof response.data !== "object") {
      throw new Error("Invalid response format from author endpoint");
    }

    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error(
          "Rate limit exceeded for author endpoint. Please try again later."
        );
      }
      if (error.response?.status === 403) {
        throw new Error(
          "403 Forbidden: Invalid or missing Semantic Scholar API key. Please check your SEMANTIC_SCHOLAR_API_KEY configuration."
        );
      }
      if (error.response?.status === 401) {
        throw new Error(
          "401 Unauthorized: Authentication failed. Please verify your Semantic Scholar API key."
        );
      }
      if (error.response?.status === 400) {
        const errorMsg =
          error.response.data.error || "Invalid author parameters";
        throw new Error(`API Error: ${errorMsg}`);
      }
      if (error.response?.status === 404) {
        throw new Error(`Author with ID '${authorId}' not found`);
      }
      if (error.response?.status === 500) {
        throw new Error("Semantic Scholar API server error");
      }

      // Handle response size limit error
      if (
        error.response?.status === 413 ||
        (error.response?.data?.error &&
          error.response.data.error.includes("exceed maximum size"))
      ) {
        throw new Error(
          "Response exceeds maximum size (10 MB). Try requesting fewer fields."
        );
      }

      // Handle other error cases
      if (error.response) {
        throw new Error(
          `API Error (${error.response.status}): ${
            error.response.data?.error || error.message
          }`
        );
      } else if (error.request) {
        throw new Error(
          `Network Error: No response received - ${error.message}`
        );
      }
    }

    // Re-throw unknown errors
    throw error;
  }
};

/**
 * Get papers by a specific author using the Semantic Scholar API
 *
 * @param authorParams AuthorParams object containing authorId
 * @param paginationParams PaginationParams object for pagination and fields
 * @returns Promise with Paper data, offset, and next page token
 * @throws Error with specific message for API errors
 *
 * @example
 * // Get author papers with default pagination
 * const papers = await getAuthorPapers({ authorId: '1741101' });
 *
 * @example
 * // Get author papers with custom pagination and fields
 * const papers = await getAuthorPapers(
 *   { authorId: '1741101' },
 *   { offset: 0, limit: 50, fields: 'title,year,authors' }
 * );
 *
 * @example
 * // Get author papers with nested fields
 * const papers = await getAuthorPapers(
 *   { authorId: '1741101' },
 *   { fields: 'citations.authors,references.title' }
 * );
 */
export const getAuthorPapers = async (
  { authorId }: AuthorParams,
  { offset = 0, limit = 100, fields }: PaginationParams
): Promise<{ data: Paper[]; offset: number; next?: number }> => {
  if (!authorId) {
    throw new Error("Author ID is required");
  }

  // Validate limit (API maximum is 1000)
  if (limit > 1000) {
    console.warn("Limit exceeds maximum of 1000. Setting to 1000.");
    limit = 1000;
  }

  // Build query parameters
  const queryParams = buildQueryParams({ offset, limit, fields });
  const url = `/author/${encodeURIComponent(authorId)}/papers?${queryParams}`;

  try {
    const response = await semanticScholarClient.get(url);

    // Validate response structure
    if (!response.data || !Array.isArray(response.data.data)) {
      throw new Error("Invalid response format from author papers endpoint");
    }

    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error(
          "Rate limit exceeded for author papers endpoint. Please try again later."
        );
      }
      if (error.response?.status === 403) {
        throw new Error(
          "403 Forbidden: Invalid or missing Semantic Scholar API key. Please check your SEMANTIC_SCHOLAR_API_KEY configuration."
        );
      }
      if (error.response?.status === 401) {
        throw new Error(
          "401 Unauthorized: Authentication failed. Please verify your Semantic Scholar API key."
        );
      }
      if (error.response?.status === 400) {
        const errorMsg =
          error.response.data.error || "Invalid author papers parameters";
        throw new Error(`API Error: ${errorMsg}`);
      }
      if (error.response?.status === 404) {
        throw new Error(`Author with ID '${authorId}' not found`);
      }
      if (error.response?.status === 500) {
        throw new Error("Semantic Scholar API server error");
      }

      // Handle response size limit error
      if (
        error.response?.status === 413 ||
        (error.response?.data?.error &&
          error.response.data.error.includes("exceed maximum size"))
      ) {
        throw new Error(
          "Response exceeds maximum size (10 MB). Try requesting fewer fields or reducing the limit."
        );
      }

      // Handle other error cases
      if (error.response) {
        throw new Error(
          `API Error (${error.response.status}): ${
            error.response.data?.error || error.message
          }`
        );
      } else if (error.request) {
        throw new Error(
          `Network Error: No response received - ${error.message}`
        );
      }
    }

    // Re-throw unknown errors
    throw error;
  }
};

/**
 * Get details for multiple authors at once using the /author/batch endpoint
 * @param params AuthorBatchParams object containing author IDs and optional fields
 * @returns Promise with an array of Author objects
 * @throws Error if the API limits are exceeded or if the API returns an error
 *
 * @example
 * // Get basic details for multiple authors
 * const authors = await getAuthorsBatch({
 *   ids: ["1741101", "1780531"]
 * });
 *
 * @example
 * // Get specific fields for multiple authors
 * const authors = await getAuthorsBatch({
 *   ids: ["1741101", "1780531"],
 *   fields: "name,hIndex,citationCount"
 * });
 */
export const getAuthorsBatch = async ({
  ids,
  fields,
}: AuthorBatchParams): Promise<Author[]> => {
  // Validate API limitations
  if (ids.length > 1000) {
    throw new Error(
      "Semantic Scholar API can only process 1,000 author IDs at a time"
    );
  }

  // Fields is a query parameter, not part of the request body
  const queryParams = fields ? `?fields=${fields}` : "";

  try {
    // Make POST request with IDs in the request body
    const response = await semanticScholarClient.post(
      `/author/batch${queryParams}`,
      {
        ids: ids,
      }
    );

    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new Error(
          "Rate limit exceeded for /author/batch. Please try again later."
        );
      }
      if (error.response?.status === 403) {
        throw new Error(
          "403 Forbidden: Invalid or missing Semantic Scholar API key. Please check your SEMANTIC_SCHOLAR_API_KEY configuration."
        );
      }
      if (error.response?.status === 401) {
        throw new Error(
          "401 Unauthorized: Authentication failed. Please verify your Semantic Scholar API key."
        );
      }
      if (error.response?.status === 400) {
        const errorMsg =
          error.response.data.error || "Invalid batch parameters";
        throw new Error(`API Error: ${errorMsg}`);
      }
      if (error.response?.status === 404) {
        throw new Error("Resource not found");
      }
      if (error.response?.status === 500) {
        throw new Error("Semantic Scholar API server error");
      }

      // Handle response size limit error
      if (
        error.response?.status === 413 ||
        (error.response?.data?.error &&
          error.response.data.error.includes("exceed maximum size"))
      ) {
        throw new Error(
          "Response exceeds maximum size (10 MB). Try requesting fewer fields or reducing the number of IDs."
        );
      }
    }
    throw error;
  }
};

/**
 * Get details for multiple authors at once, automatically handling large batches
 * by splitting them into chunks of 1,000 IDs (the API limit)
 * @param params AuthorBatchParams object containing author IDs and optional fields
 * @returns Promise with an array of Author objects
 *
 * @example
 * // Get details for a large number of authors
 * const authors = await getAuthorsBatchChunked({
 *   ids: ["1741101", "1780531", ...], // Can be more than 1,000 IDs
 *   fields: "name,hIndex,citationCount"
 * });
 */
export const getAuthorsBatchChunked = async ({
  ids,
  fields,
}: AuthorBatchParams): Promise<Author[]> => {
  if (ids.length <= 1000) {
    return getAuthorsBatch({ ids, fields });
  }

  // Split IDs into chunks of 1000
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 1000) {
    chunks.push(ids.slice(i, i + 1000));
  }

  // Process each chunk sequentially to respect rate limits
  const results: Author[] = [];
  for (const chunkIds of chunks) {
    // Process chunk and wait for result
    const chunkResult = await getAuthorsBatch({ ids: chunkIds, fields });
    results.push(...chunkResult);

    // No need for additional delay since the client interceptor handles rate limiting
  }

  return results;
};
