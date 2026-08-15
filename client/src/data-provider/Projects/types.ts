/** 프로젝트(Harvey Vault류) API 타입 — bkl-api /api/projects/* 응답과 1:1. */

export type ProjectDocumentOrigin = 'chat' | 'doc_search';

export interface ProjectSummary {
  project_id: string;
  name: string;
  description: string | null;
  harvey_vault_id?: string | null;
  harvey_sync_status?: string | null;
  created_at: string;
  updated_at: string;
  document_count: number;
}

export interface ProjectDocument {
  doc_id: string;
  collection: string | null;
  file_name: string | null;
  matter_uid: string | null;
  origin: ProjectDocumentOrigin | null;
  added_at: string;
}

export interface ProjectDetail extends ProjectSummary {
  documents: ProjectDocument[];
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
