# Semantic Scholar API Integration

This directory contains the implementation for integrating with the Semantic Scholar API, providing a comprehensive TypeScript wrapper with React hooks support.

## Overview

The Semantic Scholar API wrapper provides a robust interface for interacting with the Semantic Scholar Academic Graph. It includes:

- A fully typed client with comprehensive error handling
- Rate limiting with intelligent retry mechanisms
- A fluent filter builder API for constructing complex queries
- React hooks for easy integration in frontend applications
- Support for all major Semantic Scholar API endpoints

## Core Components

### Client

The base client (`client.ts`) provides:

- Axios-based HTTP client with proper headers
- Automatic API key inclusion when available
- Rate limiting for different endpoints (10 req/sec for most endpoints, 1 req/sec for batch operations)
- Automatic retry for rate limit errors (429)
- Comprehensive error handling

### Endpoints

The endpoints implementation (`endpoints.ts`) provides functions for all major Semantic Scholar API endpoints:

- Paper search, match, and details
- Author search and details
- Citations and references
- Batch operations for papers and authors

### Filter Builder

The filter builder (`filters.ts`) provides a fluent API for constructing complex queries with:

- Method chaining for readable query construction
- Support for all filter parameters
- Validation and sanitization of inputs
- Constants for publication types and fields of study

### Type Definitions

The type definitions (`types.ts`) provide comprehensive TypeScript types for:

- Request parameters
- Response objects
- Filter options
- Pagination parameters

## API Endpoints

### `/paper/search`

Search for papers using various criteria.

- **Method**: GET
- **URL**: `https://api.semanticscholar.org/graph/v1/paper/search`
- **Query Parameters**:
  - `query` (required): A plain-text search query string
  - `fields`: A comma-separated list of fields to include in the response
  - `offset`: Starting position for results (default: 0)
  - `limit`: Maximum number of results to return (default: 100, max: 1000)
  - `publicationTypes`: Comma-separated list of publication types to filter by
  - `openAccessPdf`: Flag to only include papers with open access PDFs
  - `minCitationCount`: Minimum number of citations a paper must have
  - `publicationDateOrYear`: Date range in format `YYYY-MM-DD:YYYY-MM-DD`
  - `year`: Year range in format `YYYY-YYYY`, `YYYY-`, or `-YYYY`
  - `venue`: Comma-separated list of venues to filter by
  - `fieldsOfStudy`: Comma-separated list of fields of study to filter by
  - `sort`: Sort field and order (e.g., `citationCount:desc`)
- **Response**: Object containing total count, offset, next page token, and array of paper objects
- **Rate Limit**: 10 requests per second

```typescript
// Using the endpoint directly
const results = await searchPapers({
  query: "machine learning",
  fields: "title,abstract,authors",
  limit: 10,
});

// Using the hook
const { data, isLoading, error } = usePaperSearch({
  query: "machine learning",
  fields: "title,abstract,authors",
  limit: 10,
});
```

### `/paper/search/match`

Find a single paper based on the closest title match to a given query.

- **Method**: GET
- **URL**: `https://api.semanticscholar.org/graph/v1/paper/search/match`
- **Query Parameters**:
  - `query` (required): A plain-text search query string, typically a paper title
  - `fields`: A comma-separated list of fields to include in the response
  - `publicationTypes`: Comma-separated list of publication types to filter by
  - `openAccessPdf`: Flag to only include papers with open access PDFs
  - `minCitationCount`: Minimum number of citations a paper must have
  - `publicationDateOrYear`: Date range in format `YYYY-MM-DD:YYYY-MM-DD`
  - `year`: Year range in format `YYYY-YYYY`, `YYYY-`, or `-YYYY`
  - `venue`: Comma-separated list of venues to filter by
  - `fieldsOfStudy`: Comma-separated list of fields of study to filter by
- **Response**: A single paper object with the requested fields and a `matchScore` indicating the quality of the match
- **Error**: Returns a 404 error with "Title match not found" message if no match is found
- **Rate Limit**: 10 requests per second

```typescript
// Using the endpoint directly
const paper = await matchPaper({
  query: "Construction of the Literature Graph in Semantic Scholar",
  fields: "title,abstract,authors,year,venue,matchScore",
});

// Using the hook
const { data, isLoading, error } = usePaperMatch({
  query: "Construction of the Literature Graph in Semantic Scholar",
  fields: "title,abstract,authors,year,venue,matchScore",
});
```

### `/paper/search/bulk`

Bulk search for papers with pagination support.

- **Method**: GET
- **URL**: `https://api.semanticscholar.org/graph/v1/paper/search/bulk`
- **Query Parameters**: Same as `/paper/search` but with `token` for pagination instead of `offset`
- **Response**: Object containing total count, next page token, and array of paper objects
- **Rate Limit**: 1 request per second

```typescript
// Using the endpoint directly
const results = await searchPapersBulk({
  query: "machine learning",
  fields: "title,abstract,authors",
  limit: 100,
});

// Using the hook
const { data, isLoading, error } = usePaperBulkSearch({
  query: "machine learning",
  fields: "title,abstract,authors",
  limit: 100,
});
```

### `/paper/batch`

Get details for multiple papers at once by providing their IDs.

- **Method**: POST
- **URL**: `https://api.semanticscholar.org/graph/v1/paper/batch`
- **Query Parameters**:
  - `fields`: A comma-separated list of fields to include in the response (e.g., `title,abstract,authors`)
- **Request Body**:
  ```json
  {
    "ids": ["paperId1", "paperId2", "ARXIV:2106.15928", ...]
  }
  ```
- **Response**: An array of paper objects with the requested fields
- **Limitations**:
  - Can only process 500 paper IDs at a time
  - Can only return up to 10 MB of data at a time
- **Rate Limit**: 1 request per second

```typescript
// Using the endpoint directly
const papers = await getPapersBatch({
  ids: ["649def34f8be52c8b66281af98ae884c09aef38b", "ARXIV:2106.15928"],
  fields: "title,abstract,authors,year,citationCount"
});

// For more than 500 IDs, use the chunked version
const manyPapers = await getPapersBatchChunked({
  ids: ["id1", "id2", ...], // Can be more than 500
  fields: "title,abstract,authors"
});

// Using the hook (automatically handles chunking)
const { data, isLoading, error } = usePaperBatch({
  ids: ["649def34f8be52c8b66281af98ae884c09aef38b", "ARXIV:2106.15928"],
  fields: "title,abstract,authors,year,citationCount"
});
```

### `/paper/{paperId}`

Get details for a specific paper.

- **Method**: GET
- **URL**: `https://api.semanticscholar.org/graph/v1/paper/{paperId}`
- **Path Parameters**:
  - `paperId`: Semantic Scholar ID, arXiv ID (prefixed with `ARXIV:`), DOI, etc.
- **Query Parameters**:
  - `fields`: A comma-separated list of fields to include in the response
- **Response**: A paper object with the requested fields
- **Rate Limit**: 10 requests per second

```typescript
// Using the endpoint directly
const paper = await getPaper({
  paperId: "649def34f8be52c8b66281af98ae884c09aef38b",
  fields: "title,abstract,authors,year,citationCount",
});

// Using the hook
const { data, isLoading, error } = usePaper({
  paperId: "649def34f8be52c8b66281af98ae884c09aef38b",
  fields: "title,abstract,authors,year,citationCount",
});
```

### `/paper/{paperId}/citations`

Get citations for a specific paper.

- **Method**: GET
- **URL**: `https://api.semanticscholar.org/graph/v1/paper/{paperId}/citations`
- **Path Parameters**:
  - `paperId`: Semantic Scholar ID, arXiv ID (prefixed with `ARXIV:`), DOI, etc.
- **Query Parameters**:
  - `fields`: A comma-separated list of fields to include in the response
  - `offset`: Starting position for results (default: 0)
  - `limit`: Maximum number of results to return (default: 100, max: 1000)
- **Response**: Object containing offset, next page token, and array of citation objects
- **Rate Limit**: 10 requests per second

```typescript
// Using the endpoint directly
const citations = await getPaperCitations(
  { paperId: "649def34f8be52c8b66281af98ae884c09aef38b" },
  {
    offset: 0,
    limit: 100,
    fields: "citingPaper.title,citingPaper.authors,isInfluential",
  }
);
```

### `/paper/{paperId}/references`

Get references for a specific paper.

- **Method**: GET
- **URL**: `https://api.semanticscholar.org/graph/v1/paper/{paperId}/references`
- **Path Parameters**:
  - `paperId`: Semantic Scholar ID, arXiv ID (prefixed with `ARXIV:`), DOI, etc.
- **Query Parameters**:
  - `fields`: A comma-separated list of fields to include in the response
  - `offset`: Starting position for results (default: 0)
  - `limit`: Maximum number of results to return (default: 100, max: 1000)
- **Response**: Object containing offset, next page token, and array of reference objects
- **Rate Limit**: 10 requests per second

```typescript
// Using the endpoint directly
const references = await getPaperReferences(
  { paperId: "649def34f8be52c8b66281af98ae884c09aef38b" },
  {
    offset: 0,
    limit: 100,
    fields: "citedPaper.title,citedPaper.authors,isInfluential",
  }
);
```

### `/author/search`

Search for authors.

- **Method**: GET
- **URL**: `https://api.semanticscholar.org/graph/v1/author/search`
- **Query Parameters**:
  - `query` (required): A plain-text search query string
  - `fields`: A comma-separated list of fields to include in the response
  - `offset`: Starting position for results (default: 0)
  - `limit`: Maximum number of results to return (default: 100, max: 1000)
- **Response**: Object containing total count, offset, next page token, and array of author objects
- **Rate Limit**: 10 requests per second

```typescript
// Using the endpoint directly
const authors = await searchAuthors({
  query: "Andrew Ng",
  fields: "name,affiliations,paperCount,citationCount",
  limit: 10,
});

// Using the hook
const { data, isLoading, error } = useAuthorSearch({
  query: "Andrew Ng",
  fields: "name,affiliations,paperCount,citationCount",
  limit: 10,
});
```

### `/author/{authorId}`

Get details for a specific author.

- **Method**: GET
- **URL**: `https://api.semanticscholar.org/graph/v1/author/{authorId}`
- **Path Parameters**:
  - `authorId`: Semantic Scholar author ID
- **Query Parameters**:
  - `fields`: A comma-separated list of fields to include in the response
- **Response**: An author object with the requested fields
- **Rate Limit**: 10 requests per second

```typescript
// Using the endpoint directly
const author = await getAuthor({
  authorId: "1741101",
  fields: "name,affiliations,paperCount,citationCount,hIndex",
});

// Using the hook
const { data, isLoading, error } = useAuthor({
  authorId: "1741101",
  fields: "name,affiliations,paperCount,citationCount,hIndex",
});
```

### `/author/{authorId}/papers`

Get papers by a specific author.

- **Method**: GET
- **URL**: `https://api.semanticscholar.org/graph/v1/author/{authorId}/papers`
- **Path Parameters**:
  - `authorId`: Semantic Scholar author ID
- **Query Parameters**:
  - `fields`: A comma-separated list of fields to include in the response
  - `offset`: Starting position for results (default: 0)
  - `limit`: Maximum number of results to return (default: 100, max: 1000)
- **Response**: Object containing offset, next page token, and array of paper objects
- **Rate Limit**: 10 requests per second

```typescript
// Using the endpoint directly
const papers = await getAuthorPapers(
  { authorId: "1741101" },
  { offset: 0, limit: 100, fields: "title,year,venue,citationCount" }
);
```

### `/author/batch`

Get details for multiple authors at once.

- **Method**: POST
- **URL**: `https://api.semanticscholar.org/graph/v1/author/batch`
- **Query Parameters**:
  - `fields`: A comma-separated list of fields to include in the response
- **Request Body**:
  ```json
  {
    "ids": ["authorId1", "authorId2", ...]
  }
  ```
- **Response**: An array of author objects with the requested fields
- **Limitations**:
  - Can only process 1000 author IDs at a time
  - Can only return up to 10 MB of data at a time
- **Rate Limit**: 1 request per second

```typescript
// Using the endpoint directly
const authors = await getAuthorsBatch({
  ids: ["1741101", "1780531"],
  fields: "name,affiliations,paperCount,citationCount,hIndex"
});

// For more than 1000 IDs, use the chunked version
const manyAuthors = await getAuthorsBatchChunked({
  ids: ["id1", "id2", ...], // Can be more than 1000
  fields: "name,affiliations,paperCount"
});

// Using the hook (automatically handles chunking)
const { data, isLoading, error } = useAuthorBatch({
  ids: ["1741101", "1780531"],
  fields: "name,affiliations,paperCount,citationCount,hIndex"
});
```

## Filter Builder

The `FilterBuilder` class provides a fluent API for building search parameters for the Semantic Scholar API. It simplifies the process of creating complex queries with multiple filters.

### Basic Usage

```typescript
import { createFilter } from "@/lib/api/semanticScholar/filters";

// Create a filter with an initial query
const filter = createFilter("machine learning")
  .withYearRange(2020, 2023)
  .withFields(["title", "abstract", "authors"])
  .withOpenAccessOnly()
  .withMinCitations(10);

// Use with search endpoint
const results = await searchPapers(filter);
```

### Paper Match Usage

```typescript
import {
  createFilter,
  PUBLICATION_TYPES,
  FIELDS_OF_STUDY,
} from "@/lib/api/semanticScholar/filters";

// Basic paper match
const filter = createFilter(
  "Construction of the Literature Graph in Semantic Scholar"
).withFields(["title", "abstract", "authors", "year", "venue", "matchScore"]);

// Use buildMatchParams() for the match endpoint
const matchParams = filter.buildMatchParams();
const paper = await matchPaper(matchParams);

// Advanced paper match with filters
const advancedFilter = createFilter(
  "Neural Networks for Natural Language Processing"
)
  .withFields([
    "title",
    "abstract",
    "authors",
    "year",
    "venue",
    "url",
    "citationCount",
    "matchScore",
  ])
  .withYearRange(2018, 2023)
  .withOpenAccessOnly()
  .withPublicationTypes([
    PUBLICATION_TYPES.JOURNAL_ARTICLE,
    PUBLICATION_TYPES.CONFERENCE,
  ])
  .withFieldsOfStudy([FIELDS_OF_STUDY.COMPUTER_SCIENCE])
  .withMinCitations(50);

const advancedMatchParams = advancedFilter.buildMatchParams();
const matchedPaper = await matchPaper(advancedMatchParams);

// Using the hook
const { data, isLoading, error } = usePaperMatch(advancedFilter);
```

### Available Filter Methods

- `withQuery(query: string)`: Set the search query
- `withPagination(offset: number, limit: number)`: Set pagination parameters
- `withFields(fields: string | string[])`: Set fields to return
- `withYearRange(start?: number, end?: number)`: Filter by year range
- `withDateRange(start?: string, end?: string)`: Filter by publication date range
- `withFieldsOfStudy(fields: string[] | ArrayFilterParam)`: Filter by fields of study
- `withVenues(venues: string[] | string)`: Filter by venues
- `withPublicationTypes(types: string[] | string)`: Filter by publication types
- `withSort(field: string, order: 'asc' | 'desc')`: Set sort order
- `withOpenAccessOnly(openAccessOnly: boolean)`: Filter for open access papers
- `withMinCitations(count: number)`: Filter by minimum citation count

## React Hooks

The wrapper provides React hooks for all major endpoints, built on top of React Query (TanStack Query).

### Available Hooks

- `usePaperSearch`: Search for papers
- `usePaperBulkSearch`: Bulk search for papers
- `usePaperMatch`: Find a paper by title match
- `usePaper`: Get details for a specific paper
- `usePaperBatch`: Get details for multiple papers
- `useAuthorSearch`: Search for authors
- `useAuthor`: Get details for a specific author
- `useAuthorBatch`: Get details for multiple authors

### Hook Features

- Automatic caching and refetching
- Loading, error, and success states
- Pagination helpers
- Retry logic with configurable options
- TypeScript support with full type safety

### Example Usage

```typescript
import { usePaperSearch, createFilter } from "@/lib/api/semanticScholar";

// Basic usage
const { data, isLoading, error } = usePaperSearch({
  query: "machine learning",
  fields: "title,abstract,authors",
  limit: 10,
});

// With filter builder
const filter = createFilter("machine learning")
  .withYearRange(2020, 2023)
  .withFields(["title", "abstract", "authors"])
  .withMinCitations(100);

const { data, isLoading, error, fetchNextPage, hasNextPage } =
  usePaperSearch(filter);

// Pagination example
const loadMore = async () => {
  if (hasNextPage) {
    const nextPageData = await fetchNextPage();
    console.log("Loaded next page:", nextPageData);
  }
};
```

## Error Handling and Rate Limiting

### Rate Limiting

The client automatically handles rate limiting by:

1. Tracking the last request time for each endpoint type
2. Enforcing minimum intervals between requests (100ms for most endpoints, 1000ms for batch operations)
3. Automatically retrying requests that receive 429 (Too Many Requests) responses
4. Adding appropriate delays between retries

### Error Handling

The wrapper provides detailed error messages for common API errors:

- 400: Invalid parameters with specific error message from the API
- 404: Resource not found with context about what was being requested
- 413: Response too large (exceeds 10MB) with suggestions to reduce the request size
- 429: Rate limit exceeded with information about the rate limits
- 500: Server error with a generic message

### Best Practices

1. Use the `fields` parameter to request only the data you need
2. Use batch endpoints for retrieving multiple items
3. Implement pagination for large result sets
4. Handle rate limit errors by backing off and retrying
5. Set appropriate timeouts for API requests
