/**
 * A pwc_tars specialized brain ("專用腦") as surfaced to the LibreChat client.
 * Mirrors the backend `TarsDomain` (pwc_tars `SysDomain.to_dict()`):
 * `role_ids` / `knowledge_base_ids` are comma-separated id strings and
 * `domain_functions` is a JSON string of capability toggles.
 */
export type TTarsDomain = {
  id: number;
  name: string;
  description: string | null;
  role_ids: string | null;
  knowledge_base_ids: string | null;
  domain_functions: string | null;
  status: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  url?: string;
};

export type TTarsDomainsResponse = {
  domains: TTarsDomain[];
};

/** A pwc_tars role, for the domain editor's role multi-select. */
export type TTarsRole = {
  id: number;
  name: string;
  domain_ids?: string | null;
};

/** A pwc_tars knowledge base. `*_count` stats are present on the admin listing. */
export type TTarsKnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  data_source_type?: string | null;
  embedding_model?: string | null;
  rerank_model?: string | null;
  llm_model?: string | null;
  max_retrieve_count?: number | null;
  status?: boolean;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  document_count?: number;
  website_count?: number;
  api_count?: number;
  fs_count?: number;
  total_chunk_count?: number;
  total_token_count?: number;
  has_sql_database?: boolean;
};

export type TTarsDomainPrepareData = {
  sys_domains: TTarsDomain[];
  knowledge_bases: TTarsKnowledgeBase[];
  roles: TTarsRole[];
};

/** Create/update payload for a specialized brain. */
export type TTarsDomainInput = {
  name: string;
  description?: string;
  role_ids?: string;
  knowledge_base_ids?: string;
  domain_functions?: string;
  status?: number | boolean;
};

export type TTarsKnowledgeBasesResponse = {
  knowledgeBases: TTarsKnowledgeBase[];
};

export type TTarsModelOption = {
  id: string;
  name: string;
};

export type TTarsModelOptions = {
  llm: TTarsModelOption[];
  embedding: TTarsModelOption[];
  rerank: TTarsModelOption[];
};

export type TTarsKnowledgeBaseInput = {
  name: string;
  description?: string;
  data_source_type?: string;
  embedding_model?: string;
  collection_binding_name?: string;
};

export type TTarsKnowledgeBaseUpdate = {
  name?: string;
  description?: string;
  domain_ids?: string;
  new_max_retrieve_count?: number;
};
