import { SearchParams, ArrayFilterParam, MatchParams } from "./types.js";

/**
 * Sanitizes a search query for endpoints that don't support hyphens
 * - Replaces hyphens with spaces (as hyphenated terms yield no matches in some endpoints)
 * - Only needed for /paper/search and /author/search endpoints
 * @param query The original search query
 * @returns Sanitized query string
 */
export const sanitizeQuery = (query: string): string => {
  // Replace hyphens with spaces
  return query.replace(/-/g, " ");
};

/**
 * Predefined publication types for Semantic Scholar API
 */
export const PUBLICATION_TYPES = {
  REVIEW: "Review",
  JOURNAL_ARTICLE: "JournalArticle",
  CASE_REPORT: "CaseReport",
  CLINICAL_TRIAL: "ClinicalTrial",
  CONFERENCE: "Conference",
  DATASET: "Dataset",
  EDITORIAL: "Editorial",
  LETTERS_AND_COMMENTS: "LettersAndComments",
  META_ANALYSIS: "MetaAnalysis",
  NEWS: "News",
  STUDY: "Study",
  BOOK: "Book",
  BOOK_SECTION: "BookSection",
};

/**
 * Predefined fields of study for Semantic Scholar API
 */
export const FIELDS_OF_STUDY = {
  COMPUTER_SCIENCE: "Computer Science",
  MEDICINE: "Medicine",
  CHEMISTRY: "Chemistry",
  BIOLOGY: "Biology",
  MATERIALS_SCIENCE: "Materials Science",
  PHYSICS: "Physics",
  GEOLOGY: "Geology",
  PSYCHOLOGY: "Psychology",
  ART: "Art",
  HISTORY: "History",
  GEOGRAPHY: "Geography",
  SOCIOLOGY: "Sociology",
  BUSINESS: "Business",
  POLITICAL_SCIENCE: "Political Science",
  ECONOMICS: "Economics",
  PHILOSOPHY: "Philosophy",
  MATHEMATICS: "Mathematics",
  ENGINEERING: "Engineering",
  ENVIRONMENTAL_SCIENCE: "Environmental Science",
  AGRICULTURAL_AND_FOOD_SCIENCES: "Agricultural and Food Sciences",
  EDUCATION: "Education",
  LAW: "Law",
  LINGUISTICS: "Linguistics",
};

/**
 * A utility class for building search parameters with a fluent API
 */
export class FilterBuilder {
  private params: Record<
    string,
    string | number | boolean | string[] | undefined
  > = {};

  /**
   * Set the search query
   * @param query The search query string
   */
  withQuery(query: string) {
    this.params.query = query;
    return this;
  }

  /**
   * Set pagination parameters
   * @param offset Starting position for results
   * @param limit Maximum number of results to return (max 100)
   */
  withPagination(offset: number, limit: number) {
    this.params.offset = offset;
    // Ensure limit doesn't exceed API maximum
    this.params.limit = Math.min(limit, 100);
    if (limit > 100) {
      console.warn(
        "Limit parameter exceeds maximum value of 100. Setting to 100."
      );
    }
    return this;
  }

  /**
   * Set the fields to return in the response
   * @param fields Array of field names or comma-separated string
   */
  withFields(fields: string | string[]) {
    this.params.fields = Array.isArray(fields) ? fields.join(",") : fields;
    return this;
  }

  /**
   * Set the year range filter
   * @param start Starting year (inclusive)
   * @param end Ending year (inclusive)
   */
  withYearRange(start?: number, end?: number) {
    if (start && end) {
      this.params.year = `${start}-${end}`;
    } else if (start) {
      this.params.year = `${start}-`;
    } else if (end) {
      this.params.year = `-${end}`;
    }
    return this;
  }

  /**
   * Set the publication date range filter
   * @param start Starting date (YYYY-MM-DD format)
   * @param end Ending date (YYYY-MM-DD format)
   */
  withDateRange(start?: string, end?: string) {
    if (start || end) {
      this.params.publicationDateOrYear = [start, end]
        .filter(Boolean)
        .join(":");
    }
    return this;
  }

  /**
   * Set the fields of study filter
   * @param fields Array of field names or ArrayFilterParam object
   */
  withFieldsOfStudy(fields: string[] | ArrayFilterParam) {
    if (Array.isArray(fields)) {
      // Store as array, will be joined in build()
      this.params.fieldsOfStudy = fields;
    } else {
      // Store as array with operator metadata
      this.params.fieldsOfStudy = fields.value;
      // We'll handle the operator in build() if needed
    }
    return this;
  }

  /**
   * Set the venues filter
   * @param venues Array of venue names or string
   */
  withVenues(venues: string[] | string) {
    if (Array.isArray(venues)) {
      this.params.venue = venues;
    } else {
      this.params.venue = venues; // redundant
    }
    return this;
  }

  /**
   * Set the publication types filter
   * @param types Array of publication type names or string
   */
  withPublicationTypes(types: string[] | string) {
    if (Array.isArray(types)) {
      this.params.publicationTypes = types;
    } else {
      this.params.publicationTypes = types;
    }
    return this;
  }

  /**
   * Set the sort parameter
   * @param field Field to sort by
   * @param order Sort order ('asc' or 'desc')
   */
  withSort(field: string, order: "asc" | "desc" = "desc") {
    this.params.sort = `${field}:${order}`;
    return this;
  }

  /**
   * Set the open access PDF filter
   * @param openAccessOnly Whether to only include papers with open access PDFs
   */
  withOpenAccessOnly(openAccessOnly: boolean = true) {
    if (openAccessOnly) {
      this.params.openAccessPdf = true;
    }
    return this;
  }

  /**
   * Set the minimum citation count filter
   * @param count Minimum number of citations
   */
  withMinCitations(count: number) {
    this.params.minCitationCount = count;
    return this;
  }

  /**
   * Build the final search parameters object
   * @returns SearchParams object
   */
  build(): SearchParams {
    // Ensure query is present (required by the API)
    if (!this.params.query) {
      throw new Error("Query parameter is required for paper search");
    }

    // Validate limit parameter
    if (this.params.limit && typeof this.params.limit === "number") {
      if (this.params.limit > 100) {
        console.warn(
          "Limit parameter exceeds maximum value of 100. Setting to 100."
        );
        this.params.limit = 100;
      }
    }

    // Validate against API limitations
    if (this.params.offset && this.params.limit) {
      const potentialTotal =
        Number(this.params.offset) + Number(this.params.limit);
      if (potentialTotal > 1000) {
        console.warn(
          "Semantic Scholar API can only return up to 1,000 results. Consider using bulk search for larger queries."
        );
      }
    }

    // Process any array parameters to convert them to strings
    const processedParams: Record<
      string,
      string | number | boolean | undefined
    > = {};

    Object.entries(this.params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        processedParams[key] = value.join(",");
      } else {
        processedParams[key] = value;
      }
    });

    return processedParams as SearchParams;
  }

  /**
   * Build parameters for paper/search/match endpoint
   * @returns MatchParams object
   */
  buildMatchParams(): MatchParams {
    // Ensure query is present (required by the API)
    if (!this.params.query) {
      throw new Error("Query parameter is required for paper match");
    }

    // Create match params with all supported parameters
    const matchParams: MatchParams = {
      query: this.params.query as string,
    };

    // Add optional parameters if they exist
    if (this.params.fields) {
      matchParams.fields = Array.isArray(this.params.fields)
        ? this.params.fields.join(",")
        : (this.params.fields as string);
    }

    // Add additional supported parameters according to the documentation
    const supportedParams = [
      "publicationTypes",
      "openAccessPdf",
      "minCitationCount",
      "publicationDateOrYear",
      "year",
      "venue",
      "fieldsOfStudy",
    ];

    supportedParams.forEach((param) => {
      if (this.params[param] !== undefined) {
        if (Array.isArray(this.params[param])) {
          matchParams[param] = (this.params[param] as string[]).join(",");
        } else {
          matchParams[param] = this.params[param] as string | number | boolean;
        }
      }
    });

    return matchParams;
  }
}

/**
 * Helper function to create a new FilterBuilder instance
 * @param initialQuery Optional initial query string
 * @returns A new FilterBuilder instance
 */
export const createFilter = (initialQuery?: string): FilterBuilder => {
  const builder = new FilterBuilder();
  if (initialQuery) {
    builder.withQuery(initialQuery);
  }
  return builder;
};
