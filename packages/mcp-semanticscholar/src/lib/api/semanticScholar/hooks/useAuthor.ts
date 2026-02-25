import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import { getAuthor, getAuthorPapers } from "../endpoints.js";
import { AuthorParams, PaginationParams, Author, Paper } from "../types.js";

/**
 * Predefined field sets for common author data use cases
 */
export const AUTHOR_FIELDS = {
  /** Basic author information */
  BASIC: "name,url,affiliations",
  /** Publication metrics */
  METRICS: "paperCount,citationCount,hIndex",
  /** External identifiers */
  EXTERNAL_IDS: "externalIds",
  /** Author's papers (basic info) */
  PAPERS_BASIC: "papers.title,papers.year",
  /** Author's papers with authors */
  PAPERS_WITH_AUTHORS: "papers.title,papers.year,papers.authors",
  /** Full author details (excluding papers) */
  FULL: "name,url,affiliations,paperCount,citationCount,hIndex,externalIds,homepage",
};

/**
 * React Query hook for fetching author details
 *
 * @param params AuthorParams object containing authorId and optional fields
 * @param options Optional React Query configuration options
 * @returns Query result with Author data
 *
 * @example
 * // Basic usage
 * const { data, isLoading, error } = useAuthor({
 *   authorId: '1741101'
 * });
 *
 * @example
 * // With specific fields
 * const { data, isLoading, error } = useAuthor({
 *   authorId: '1741101',
 *   fields: 'url,affiliations,paperCount,citationCount'
 * });
 *
 * @example
 * // Using predefined field sets
 * const { data, isLoading, error } = useAuthor({
 *   authorId: '1741101',
 *   fields: `${AUTHOR_FIELDS.BASIC},${AUTHOR_FIELDS.METRICS}`
 * });
 */
export const useAuthor = (
  { authorId, fields }: AuthorParams,
  options?: Omit<UseQueryOptions<Author, Error>, "queryKey" | "queryFn">
): UseQueryResult<Author, Error> => {
  return useQuery<Author, Error>({
    queryKey: ["author", authorId, fields],
    queryFn: () => getAuthor({ authorId, fields }),
    enabled: !!authorId,
    retry: (failureCount, error) => {
      // Don't retry if the author is not found
      if (error.message.includes("not found")) {
        return false;
      }
      // Don't retry for invalid parameters
      if (error.message.includes("Invalid author parameters")) {
        return false;
      }
      // Don't retry for response size errors
      if (error.message.includes("exceeds maximum size")) {
        return false;
      }
      // Otherwise, retry up to 3 times
      return failureCount < 3;
    },
    ...options,
  });
};

/**
 * React Query hook for fetching an author's papers
 *
 * @param authorParams AuthorParams object containing authorId
 * @param paginationParams PaginationParams object for pagination and fields
 * @param options Optional React Query configuration options
 * @returns Query result with Paper data, offset, and next page token
 *
 * @example
 * // Basic usage
 * const { data, isLoading, error } = useAuthorPapers(
 *   { authorId: '1741101' }
 * );
 *
 * @example
 * // With pagination and fields
 * const { data, isLoading, error } = useAuthorPapers(
 *   { authorId: '1741101' },
 *   { offset: 0, limit: 50, fields: 'title,year,authors' }
 * );
 *
 * @example
 * // With nested fields
 * const { data, isLoading, error } = useAuthorPapers(
 *   { authorId: '1741101' },
 *   { fields: 'citations.authors,references.title' }
 * );
 */
export const useAuthorPapers = (
  authorParams: AuthorParams,
  paginationParams: PaginationParams = {},
  options?: Omit<
    UseQueryOptions<{ data: Paper[]; offset: number; next?: number }, Error>,
    "queryKey" | "queryFn"
  >
) => {
  const { authorId } = authorParams;
  const { offset = 0, limit = 100, fields } = paginationParams;

  return useQuery<{ data: Paper[]; offset: number; next?: number }, Error>({
    queryKey: ["authorPapers", authorId, offset, limit, fields],
    queryFn: () => getAuthorPapers({ authorId }, { offset, limit, fields }),
    enabled: !!authorId,
    retry: (failureCount, error) => {
      // Don't retry if the author is not found
      if (error.message?.includes("not found")) {
        return false;
      }
      // Don't retry for response size errors
      if (error.message?.includes("exceeds maximum size")) {
        return false;
      }
      // Otherwise, retry up to 3 times
      return failureCount < 3;
    },
    ...options,
  });
};
