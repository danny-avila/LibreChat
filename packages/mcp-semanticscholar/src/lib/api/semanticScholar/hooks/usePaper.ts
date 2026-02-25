import {
  useQuery,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import {
  getPaper,
  getPaperCitations,
  getPaperReferences,
} from "../endpoints.js";
import {
  PaperParams,
  PaginationParams,
  Paper,
  Citation,
  Reference,
} from "../types.js";

/**
 * Predefined field sets for common use cases
 */
export const PAPER_FIELDS = {
  /** Basic paper information */
  BASIC: "title,url,year,abstract",
  /** Author information */
  AUTHORS: "authors.name,authors.url,authors.affiliations",
  /** Citation information */
  CITATION_INFO: "citationCount,influentialCitationCount",
  /** Publication details */
  PUBLICATION: "venue,publicationVenue,publicationDate,journal",
  /** Open access information */
  OPEN_ACCESS: "isOpenAccess,openAccessPdf",
  /** Classification information */
  CLASSIFICATION: "fieldsOfStudy,s2FieldsOfStudy,publicationTypes",
  /** Citation data */
  CITATIONS: "citations.paperId,citations.title,citations.authors",
  /** Reference data */
  REFERENCES: "references.paperId,references.title,references.authors",
  /** Full paper details (excluding large data like citations/references) */
  FULL: "title,url,year,abstract,authors,venue,publicationVenue,publicationDate,journal,citationCount,influentialCitationCount,isOpenAccess,openAccessPdf,fieldsOfStudy,s2FieldsOfStudy,publicationTypes,externalIds",
};

/**
 * React Query hook for fetching paper details
 *
 * @param params PaperParams object containing paperId and optional fields
 * @param options Optional React Query configuration options
 * @returns Query result with Paper data
 *
 * @example
 * // Basic usage
 * const { data, isLoading, error } = usePaper({
 *   paperId: '649def34f8be52c8b66281af98ae884c09aef38b'
 * });
 *
 * @example
 * // With specific fields
 * const { data, isLoading, error } = usePaper({
 *   paperId: 'DOI:10.18653/v1/N18-3011',
 *   fields: 'title,url,year,authors'
 * });
 *
 * @example
 * // Using predefined field sets
 * const { data, isLoading, error } = usePaper({
 *   paperId: 'ARXIV:2106.15928',
 *   fields: `${PAPER_FIELDS.BASIC},${PAPER_FIELDS.AUTHORS}`
 * });
 */
export const usePaper = (
  { paperId, fields }: PaperParams,
  options?: Omit<UseQueryOptions<Paper, Error>, "queryKey" | "queryFn">
): UseQueryResult<Paper, Error> => {
  return useQuery<Paper, Error>({
    queryKey: ["paper", paperId, fields],
    queryFn: () => getPaper({ paperId, fields }),
    enabled: !!paperId,
    retry: (failureCount, error) => {
      // Don't retry if the paper is not found
      if (error.message.includes("not found")) {
        return false;
      }
      // Don't retry for invalid parameters
      if (error.message.includes("Invalid paper parameters")) {
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
 * React Query hook for fetching paper citations
 *
 * @param paperParams PaperParams object containing paperId
 * @param paginationParams PaginationParams object for pagination and fields
 * @param options Optional React Query configuration options
 * @returns Query result with Citation data
 *
 * @example
 * // Basic usage
 * const { data, isLoading, error } = usePaperCitations(
 *   { paperId: '649def34f8be52c8b66281af98ae884c09aef38b' }
 * );
 *
 * @example
 * // With pagination and fields
 * const { data, isLoading, error } = usePaperCitations(
 *   { paperId: 'DOI:10.18653/v1/N18-3011' },
 *   { offset: 0, limit: 50, fields: 'contexts,intents,citingPaper.title' }
 * );
 */
export const usePaperCitations = (
  paperParams: PaperParams,
  paginationParams: PaginationParams = {},
  options?: Omit<
    UseQueryOptions<{ data: Citation[]; offset: number; next?: number }, Error>,
    "queryKey" | "queryFn"
  >
) => {
  const { paperId } = paperParams;
  const { offset = 0, limit = 100, fields } = paginationParams;

  return useQuery<{ data: Citation[]; offset: number; next?: number }, Error>({
    queryKey: ["paperCitations", paperId, offset, limit, fields],
    queryFn: () => getPaperCitations({ paperId }, { offset, limit, fields }),
    enabled: !!paperId,
    retry: (failureCount, error) => {
      // Don't retry if the paper is not found
      if (error.message?.includes("not found")) {
        return false;
      }
      // Otherwise, retry up to 3 times
      return failureCount < 3;
    },
    ...options,
  });
};

/**
 * React Query hook for fetching paper references
 *
 * @param paperParams PaperParams object containing paperId
 * @param paginationParams PaginationParams object for pagination and fields
 * @param options Optional React Query configuration options
 * @returns Query result with Reference data
 *
 * @example
 * // Basic usage
 * const { data, isLoading, error } = usePaperReferences(
 *   { paperId: '649def34f8be52c8b66281af98ae884c09aef38b' }
 * );
 *
 * @example
 * // With pagination and fields
 * const { data, isLoading, error } = usePaperReferences(
 *   { paperId: 'DOI:10.18653/v1/N18-3011' },
 *   { offset: 0, limit: 50, fields: 'contexts,intents,citedPaper.title' }
 * );
 */
export const usePaperReferences = (
  paperParams: PaperParams,
  paginationParams: PaginationParams = {},
  options?: Omit<
    UseQueryOptions<
      { data: Reference[]; offset: number; next?: number },
      Error
    >,
    "queryKey" | "queryFn"
  >
) => {
  const { paperId } = paperParams;
  const { offset = 0, limit = 100, fields } = paginationParams;

  return useQuery<{ data: Reference[]; offset: number; next?: number }, Error>({
    queryKey: ["paperReferences", paperId, offset, limit, fields],
    queryFn: () => getPaperReferences({ paperId }, { offset, limit, fields }),
    enabled: !!paperId,
    retry: (failureCount, error) => {
      // Don't retry if the paper is not found
      if (error.message?.includes("not found")) {
        return false;
      }
      // Otherwise, retry up to 3 times
      return failureCount < 3;
    },
    ...options,
  });
};
