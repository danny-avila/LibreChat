export interface KeywordSearchFilters {
  work_type?: string;
  document_type?: string;
  practice_area?: string;
  /** YYYY-MM-DD, filtered against imanage_create_date */
  date_from?: string;
  /** YYYY-MM-DD (inclusive), filtered against imanage_create_date */
  date_to?: string;
  /** lowercase extensions without leading dot, e.g. ["pdf","msg"]. 세밀 제어용. */
  extensions?: string[];
  /** 확장자 그룹: "pdf" | "msg" | "docx" | "hwpx" | "pptx" | "other" (다중 선택). */
  extension_groups?: string[];
  workspace_class?: string;
  matter_uid?: string;
}

export interface KeywordSearchRequest {
  query: string;
  top_k?: number;
  chunks_per_doc?: number;
  collection?: string;
  filters?: KeywordSearchFilters;
}

export interface ChunkPreview {
  chunk_id: string;
  content: string;
  snippet?: string | null;
  section: string | null;
  chunk_index: number;
  page_start: number | null;
  page_end: number | null;
  score: number;
}

export interface DocumentHit {
  doc_id: string;
  file_name: string;
  imanage_create_date: string | null;
  document_date: string | null;
  matter_uid: string | null;
  client_name: string | null;
  workspace_class: string | null;
  file_extension: string | null;
  work_type: string | null;
  document_type: string | null;
  practice_area_primary: string | null;
  score: number;
  chunk_count: number;
  source_url?: string | null;
  top_chunks: ChunkPreview[];
}

export interface FacetBucket {
  value: string;
  count: number;
}

export interface SearchFacets {
  extensions: FacetBucket[];
  workspace_classes?: FacetBucket[];
}

export interface KeywordSearchResponse {
  query: string;
  total: number;
  documents: DocumentHit[];
  facets?: SearchFacets;
}
