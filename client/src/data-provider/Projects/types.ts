/** 프로젝트(Harvey Vault류) API 타입 — bkl-api /api/projects/* 응답과 1:1. */

export type ProjectDocumentOrigin = 'chat' | 'doc_search';

/**
 * Harvey Vault 동기화 상태.
 *
 * `null` 은 아직 보낸 적 없음. `partial` 은 vault 는 만들어졌지만 일부 문서가
 * 원본을 못 찾았거나 회차 상한을 넘어 남은 상태로, 다시 보내면 남은 것만 올린다.
 */
export type HarveySyncStatus = 'syncing' | 'synced' | 'partial' | 'error';

export interface ProjectSummary {
  project_id: string;
  name: string;
  description: string | null;
  harvey_vault_id?: string | null;
  harvey_sync_status?: HarveySyncStatus | null;
  harvey_synced_at?: string | null;
  harvey_sync_error?: string | null;
  created_at: string;
  updated_at: string;
  document_count: number;
  /** Harvey 에 올라간 문서 수. document_count 와 함께 진행률로 쓴다. */
  harvey_synced_count?: number;
}

export interface ProjectDocument {
  doc_id: string;
  collection: string | null;
  file_name: string | null;
  matter_uid: string | null;
  origin: ProjectDocumentOrigin | null;
  added_at: string;
  harvey_file_id?: string | null;
  harvey_synced_at?: string | null;
  harvey_sync_error?: string | null;
}

export interface ProjectDetail extends ProjectSummary {
  documents: ProjectDocument[];
  /** 공유가 성사된 이메일. Harvey 계정이 없는 주소는 여기 안 들어온다. */
  harvey_shared_emails?: string[] | null;
}

export interface HarveySyncStarted {
  started: boolean;
  project_id: string;
  status: 'syncing';
}

export interface ProjectDocumentInput {
  doc_id: string;
  collection?: string | null;
  file_name?: string | null;
  matter_uid?: string | null;
  origin?: ProjectDocumentOrigin;
}

export interface AddDocumentsResult {
  added: number;
  skipped: number;
}
