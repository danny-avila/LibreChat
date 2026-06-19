import { tarsFetch, getTarsBaseUrl } from './client';

/**
 * A pwc_tars knowledge base. Base fields mirror `KnowledgeBase.to_dict()`; the
 * `*_count` stats are only present on the `prepare_data` listing.
 */
export interface TarsKnowledgeBase {
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
}

/** A selectable model option for the knowledge-base upload form. */
export interface TarsModelOption {
  id: string;
  name: string;
}

export interface TarsKnowledgeBaseInput {
  name: string;
  description?: string;
  data_source_type?: string;
  embedding_model?: string;
  collection_binding_name?: string;
}

export interface TarsKnowledgeBaseUpdate {
  name?: string;
  description?: string;
  domain_ids?: string;
  new_max_retrieve_count?: number;
}

/** A file forwarded from the LibreChat upload route to pwc_tars. */
export interface TarsUploadFile {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

export interface TarsKnowledgeBaseFileInput {
  knowledgeName: string;
  description?: string;
  tags?: string;
  llmModel: string;
  embeddingModel?: string;
  rerankModel?: string;
  maxRetrieveCount?: number;
  file: TarsUploadFile;
}

interface KnowledgeBasesResponse {
  knowledge_bases?: TarsKnowledgeBase[];
}

interface PrepareDataResponse {
  knowledge_bases?: TarsKnowledgeBase[];
}

interface RawModelName {
  model_name: string;
}

interface RawModelOption {
  id?: string;
  display_name?: string;
}

/**
 * The knowledge bases a pwc_tars user may access, with document/chunk/token
 * stats (`GET /api/knowledge_base/prepare_data`). Admins (role 1) get all KBs.
 */
export async function fetchTarsKnowledgeBases(
  tarsId: string,
  baseUrl?: string,
): Promise<TarsKnowledgeBase[]> {
  if (!tarsId) {
    return [];
  }
  const data = await tarsFetch<PrepareDataResponse>('/api/knowledge_base/prepare_data', {
    query: { user_id: tarsId },
    baseUrl,
  });
  return data?.knowledge_bases ?? [];
}

export async function createTarsKnowledgeBase(
  tarsId: string,
  input: TarsKnowledgeBaseInput,
  baseUrl?: string,
): Promise<TarsKnowledgeBase> {
  const data = await tarsFetch<{ knowledge_base: TarsKnowledgeBase }>(
    '/api/knowledge_base/create_knowledge_base',
    { method: 'POST', body: { ...input, created_by: tarsId }, baseUrl },
  );
  return data.knowledge_base;
}

export async function updateTarsKnowledgeBase(
  tarsId: string,
  knowledgeBaseId: string,
  update: TarsKnowledgeBaseUpdate,
  baseUrl?: string,
): Promise<TarsKnowledgeBase> {
  const data = await tarsFetch<{ knowledge_base: TarsKnowledgeBase }>(
    `/api/knowledge_base/update_knowledge_base/${encodeURIComponent(knowledgeBaseId)}`,
    { method: 'PUT', body: { ...update, updated_by: tarsId }, baseUrl },
  );
  return data.knowledge_base;
}

export async function deleteTarsKnowledgeBase(
  knowledgeBaseId: string,
  baseUrl?: string,
): Promise<void> {
  await tarsFetch(
    `/api/knowledge_base/delete_knowledge_base/${encodeURIComponent(knowledgeBaseId)}`,
    {
      method: 'DELETE',
      baseUrl,
    },
  );
}

/** LLM / embedding / rerank model options for the upload form. */
export async function fetchTarsModelOptions(baseUrl?: string): Promise<{
  llm: TarsModelOption[];
  embedding: TarsModelOption[];
  rerank: TarsModelOption[];
}> {
  const [llmRaw, embeddingRaw, rerankRaw] = await Promise.all([
    tarsFetch<RawModelName[]>('/api/model/get_model_list', { baseUrl }),
    tarsFetch<RawModelOption[]>('/api/model/embedding_model_list', { baseUrl }),
    tarsFetch<RawModelOption[]>('/api/model/rerank_model_list', { baseUrl }),
  ]);
  return {
    llm: (llmRaw ?? []).map((model) => ({ id: model.model_name, name: model.model_name })),
    embedding: (embeddingRaw ?? []).map((model) => ({
      id: model.id ?? '',
      name: model.display_name ?? model.id ?? '',
    })),
    rerank: (rerankRaw ?? []).map((model) => ({
      id: model.id ?? '',
      name: model.display_name ?? model.id ?? '',
    })),
  };
}

/**
 * Forwards a file to pwc_tars to create a knowledge base with content
 * (`POST /api/knowledge_base/create_knowledge_base_with_file`). pwc_tars owns
 * chunking, embedding and Milvus indexing — LibreChat only proxies the upload.
 */
export async function createTarsKnowledgeBaseWithFile(
  tarsId: string,
  input: TarsKnowledgeBaseFileInput,
  baseUrl?: string,
): Promise<KnowledgeBasesResponse & Record<string, unknown>> {
  const url = `${getTarsBaseUrl(baseUrl)}/api/knowledge_base/create_knowledge_base_with_file`;
  const form = new FormData();
  form.append('user_id', tarsId);
  form.append('knowledge_name', input.knowledgeName);
  form.append('description', input.description ?? `Knowledge base for ${input.knowledgeName}`);
  form.append('llm_model', input.llmModel);
  if (input.tags) {
    form.append('tags', input.tags);
  }
  if (input.embeddingModel) {
    form.append('embedding_model', input.embeddingModel);
  }
  if (input.rerankModel) {
    form.append('rerank_model', input.rerankModel);
  }
  if (input.maxRetrieveCount != null) {
    form.append('max_retrieve_count', String(input.maxRetrieveCount));
  }
  const blob = new Blob([new Uint8Array(input.file.buffer)], { type: input.file.mimetype });
  form.append('file', blob, input.file.filename);

  const response = await fetch(url, { method: 'POST', body: form });
  if (!response.ok) {
    throw new Error(`pwc_tars knowledge-base upload returned status ${response.status}`);
  }
  return (await response.json()) as KnowledgeBasesResponse & Record<string, unknown>;
}
