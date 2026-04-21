export interface KeywordSearchFilters {
  work_type?: string;
  document_type?: string;
  practice_area?: string;
  date_from?: string;
  date_to?: string;
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
  section: string | null;
  chunk_index: number;
  page_start: number | null;
  page_end: number | null;
  score: number;
}

export interface DocumentHit {
  doc_id: string;
  file_name: string;
  document_date: string | null;
  work_type: string | null;
  document_type: string | null;
  practice_area_primary: string | null;
  score: number;
  chunk_count: number;
  top_chunks: ChunkPreview[];
}

export interface KeywordSearchResponse {
  query: string;
  total: number;
  documents: DocumentHit[];
}
