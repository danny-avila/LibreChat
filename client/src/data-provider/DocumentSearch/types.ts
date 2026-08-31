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
  /** iManage 라이브러리 범위: "matter"(사건 문서, M) | "knowledge"(지식 DB). 생략 시 전체. */
  library?: 'matter' | 'knowledge';
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
  imanage_preview_url?: string | null;
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
  /** "M"(사건 문서) | "DB"(지식 DB) — 하이라이트 배지용 */
  source_library?: string | null;
  title_match?: boolean;
  source_url?: string | null;
  imanage_preview_url?: string | null;
  imanage_folder_url?: string | null;
  bims_url?: string | null;
  case_class?: string | null;
  edit_date?: string | null;
  last_user?: string | null;
  custom4?: string | null;
  custom1_description?: string | null;
  custom29_description?: string | null;
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
  /** 실제 반환된 문서 수 (ACL 통과 후). */
  total: number;
  /**
   * OpenSearch 가 센 문서 단위 매칭 총계 (근사). 서버측 필터·ACL 이전 값이라
   * total 보다 클 수 있다. "결과가 더 있다" 안내에만 쓸 것.
   */
  total_hit_count?: number;
  /** top_k 상한에서 실제로 잘렸는지. total_hit_count 와 달리 정확하다. */
  truncated?: boolean;
  documents: DocumentHit[];
  facets?: SearchFacets;
}
