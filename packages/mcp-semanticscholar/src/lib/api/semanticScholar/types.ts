// Types for Semantic Scholar API responses

/**
 * Author type
 * Represents an author in the Semantic Scholar API
 */
export interface Author {
  authorId: string; // Semantic Scholar ID (always returned)
  externalIds?: Record<string, string>; // External IDs (ORCID, DBLP)
  url?: string; // URL of the author on Semantic Scholar
  name: string; // Author's name (always returned)
  affiliations?: string[]; // Organizational affiliations
  homepage?: string; // Author's homepage
  paperCount?: number; // Total publications count
  citationCount?: number; // Total citations count
  hIndex?: number; // Author's h-index
  papers?: Paper[]; // Author's papers (when requested)
}

/**
 * Publication venue type
 * Represents a journal or conference
 */
export interface PublicationVenue {
  id: string; // Venue's unique ID
  name?: string; // Venue's name
  type?: string; // Type of venue
  alternative_names?: string[]; // Alternative names for the venue
  url: string; // Venue's website
}

/**
 * S2 Fields of Study type
 * Represents a field of study with its source
 */
export interface S2FieldsOfStudy {
  category: string; // Field of study category
  source: string; // Source of the classification
}

/**
 * Paper type
 * Represents a paper in the Semantic Scholar API
 */
export interface Paper {
  paperId: string; // Semantic Scholar's primary unique ID (always returned)
  corpusId?: number; // Semantic Scholar's secondary unique ID
  externalIds?: Record<string, string | number>; // External IDs (ArXiv, MAG, ACL, etc.)
  url?: string; // URL of the paper on Semantic Scholar
  title: string; // Title of the paper (always returned)
  abstract?: string; // Paper's abstract
  venue?: string; // Name of the publication venue
  publicationVenue?: PublicationVenue; // Detailed venue information
  year?: number; // Publication year
  referenceCount?: number; // Total number of references
  citationCount?: number; // Total number of citations
  influentialCitationCount?: number; // Number of influential citations
  isOpenAccess?: boolean; // Whether the paper is open access
  openAccessPdf?: {
    url: string; // Link to the PDF
    status: string; // Type of open access
    license?: string; // License information
    disclaimer?: string; // Legal disclaimer
  };
  fieldsOfStudy?: string[]; // High-level academic categories
  s2FieldsOfStudy?: S2FieldsOfStudy[]; // Fields of study with source information
  publicationTypes?: string[]; // Types of publication
  publicationDate?: string; // Publication date in YYYY-MM-DD format
  journal?: {
    volume?: string; // Journal volume
    pages?: string; // Page number range
    name?: string; // Journal name
  };
  citationStyles?: Record<string, string>; // BibTex and other citation styles
  authors?: Author[]; // List of authors
  citations?: Paper[]; // Papers that cite this paper
  references?: Paper[]; // Papers cited by this paper
  embedding?: Record<string, number[]>; // Vector embeddings (if requested)
  tldr?: {
    // Too Long Didn't Read summary
    text: string;
  };
}

/**
 * Citation type
 * Represents a citation to a paper
 */
export interface Citation {
  contexts?: string[]; // Citation contexts
  intents?: string[]; // Citation intents
  isInfluential?: boolean; // Whether the citation is influential
  citingPaper: Paper; // The paper that cites
}

/**
 * Reference type
 * Represents a reference from a paper
 */
export interface Reference {
  contexts?: string[]; // Reference contexts
  intents?: string[]; // Reference intents
  isInfluential?: boolean; // Whether the reference is influential
  citedPaper: Paper; // The paper that is cited
}

/**
 * Paper search result type
 * Represents the result of a paper search
 */
export interface PaperSearchResult {
  total: number; // Total number of matching results
  offset: number; // Starting position for this batch
  next?: number; // Starting position of the next batch
  data: Paper[]; // Array of papers in this batch
}

/**
 * Paper bulk search result type
 * Represents the result of a bulk paper search
 */
export interface PaperBulkSearchResult {
  total: number; // Total number of matching results
  token?: string; // Token for the next page
  data: Paper[]; // Array of papers in this batch
}

/**
 * Paper match result type
 * Represents the result of a paper match search
 */
export interface PaperMatchResult extends Omit<Paper, "paperId" | "title"> {
  paperId: string; // Paper ID (always returned)
  title: string; // Paper title (always returned)
  matchScore?: number; // Score indicating match quality
}

/**
 * Author search result type
 * Represents the result of an author search
 */
export interface AuthorSearchResult {
  total: string; // Approximate number of matching results (as string per API docs)
  offset: number; // Starting position for this batch
  next?: number; // Starting position of the next batch
  data: Author[]; // Array of authors in this batch
}

/**
 * Parameters for search API requests
 */
export interface SearchParams {
  query: string; // Search query (required)
  fields?: string; // Comma-separated list of fields to return
  publicationTypes?: string | string[]; // Publication types to filter by
  openAccessPdf?: boolean; // Filter for open access papers
  minCitationCount?: number; // Minimum citation count
  publicationDateOrYear?: string; // Publication date range
  year?: string; // Publication year or range
  venue?: string | string[]; // Venues to filter by
  fieldsOfStudy?: string | string[]; // Fields of study to filter by
  offset?: number; // Starting position (default: 0)
  limit?: number; // Maximum results (default: 100, max: 1000)
  sort?: string; // Sort field and order (e.g., "publicationDate:desc")
  [key: string]: string | number | boolean | string[] | undefined; // Allow additional parameters
}

/**
 * Parameters for paper match API requests
 */
export interface MatchParams {
  query: string; // Search query (required)
  fields?: string; // Comma-separated list of fields to return
  publicationTypes?: string | string[]; // Publication types to filter by
  openAccessPdf?: boolean; // Filter for open access papers
  minCitationCount?: number; // Minimum citation count
  publicationDateOrYear?: string; // Publication date range
  year?: string; // Publication year or range
  venue?: string | string[]; // Venues to filter by
  fieldsOfStudy?: string | string[]; // Fields of study to filter by
  [key: string]: string | number | boolean | string[] | undefined; // Allow additional parameters
}

/**
 * Type for array-based filter parameters
 */
export interface ArrayFilterParam {
  value: string[]; // Array of values
  operator?: "AND" | "OR"; // Logical operator for combining values
}

/**
 * Parameters for bulk paper search API requests
 */
export interface PaperBulkSearchParams {
  query?: string; // Search query (optional in bulk search)
  token?: string; // Token for pagination
  fields?: string; // Comma-separated list of fields to return
  sort?: string; // Sort field and order (e.g., "publicationDate:desc")
  publicationTypes?: string | string[]; // Publication types to filter by
  openAccessPdf?: boolean; // Filter for open access papers
  minCitationCount?: number; // Minimum citation count
  publicationDateOrYear?: string; // Publication date range
  year?: string; // Publication year or range
  venue?: string | string[]; // Venues to filter by
  fieldsOfStudy?: string | string[]; // Fields of study to filter by
  [key: string]: string | number | boolean | string[] | undefined; // Allow additional parameters
}

/**
 * Parameters for paper batch API requests
 */
export interface PaperBatchParams {
  ids: string[]; // Array of paper IDs (required)
  fields?: string; // Comma-separated list of fields to return
}

/**
 * Parameters for author batch API requests
 */
export interface AuthorBatchParams {
  ids: string[]; // Array of author IDs (required)
  fields?: string; // Comma-separated list of fields to return
}

/**
 * Parameters for paper API requests
 */
export interface PaperParams {
  paperId: string; // Paper ID (required)
  fields?: string; // Comma-separated list of fields to return
}

/**
 * Parameters for author API requests
 */
export interface AuthorParams {
  authorId: string; // Author ID (required)
  fields?: string; // Comma-separated list of fields to return
}

/**
 * Parameters for pagination in API requests
 */
export interface PaginationParams {
  offset?: number; // Starting position (default: 0)
  limit?: number; // Maximum results (default: 100, max: 1000)
  fields?: string; // Comma-separated list of fields to return
  [key: string]: string | number | undefined; // Allow additional parameters
}
