import type { SearchResultData } from 'librechat-data-provider';

export interface ChatGptAuthor {
  role: 'user' | 'assistant' | 'system' | 'tool';
  name: string | null;
}

export interface ChatGptImagePointer {
  content_type: 'image_asset_pointer';
  asset_pointer: string;
  width?: number;
  height?: number;
  size_bytes?: number;
}

export interface ChatGptAudioPointer {
  content_type: 'audio_asset_pointer';
  asset_pointer: string;
  format?: string;
  size_bytes?: number;
}

export interface ChatGptAudioTranscription {
  content_type: 'audio_transcription';
  text: string;
  direction: 'in' | 'out' | null;
}

export interface ChatGptRealtimePointer {
  content_type: 'real_time_user_audio_video_asset_pointer';
  audio_asset_pointer: ChatGptAudioPointer | null;
}

export type ChatGptPart =
  | string
  | ChatGptImagePointer
  | ChatGptAudioPointer
  | ChatGptAudioTranscription
  | ChatGptRealtimePointer;

export interface ChatGptThought {
  content: string | null;
  summary: string | null;
}

export interface ChatGptContent {
  content_type: string;
  parts?: ChatGptPart[];
  text?: string;
  language?: string;
  content?: string;
  thoughts?: ChatGptThought[];
  source_analysis_msg_id?: string;
}

export interface ChatGptSearchEntry {
  title: string | null;
  url: string | null;
  snippet: string | null;
  attributions: string | null;
}

export interface ChatGptSearchGroup {
  domain: string | null;
  entries: ChatGptSearchEntry[];
}

export interface ChatGptContentReference {
  type: string;
  alt: string | null;
  url?: string | null;
  title?: string | null;
  snippet?: string | null;
  attribution?: string | null;
  pub_date?: number | null;
  items?: ChatGptSearchEntry[];
  sources?: ChatGptSearchEntry[];
  name?: string | null;
  id?: string | null;
}

export interface ChatGptAttachment {
  id: string;
  name?: string;
  mime_type?: string;
  size?: number;
  width?: number;
  height?: number;
}

export interface ChatGptMessageMetadata {
  model_slug?: string;
  attachments?: ChatGptAttachment[];
  content_references?: ChatGptContentReference[];
  search_result_groups?: ChatGptSearchGroup[];
  image_results?: ChatGptSearchEntry[];
}

export interface ChatGptMessage {
  id: string;
  author: ChatGptAuthor;
  create_time: number | null;
  content: ChatGptContent;
  metadata?: ChatGptMessageMetadata;
}

export interface ChatGptNode {
  id: string;
  message: ChatGptMessage | null;
  parent: string | null;
  children: string[];
}

export interface ChatGptConversation {
  conversation_id: string;
  title: string | null;
  create_time: number | null;
  update_time: number | null;
  default_model_slug: string | null;
  is_archived: boolean | null;
  is_starred: boolean | null;
  pinned_time: string | null;
  mapping: Record<string, ChatGptNode>;
}

export type ImportPhase =
  | 'queued'
  | 'inspecting'
  | 'awaiting_confirmation'
  | 'conversations'
  | 'assets'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ImportCounter {
  done: number;
  total: number;
}

export interface ImportProgress {
  conversations: ImportCounter;
  messages: ImportCounter;
  assets: ImportCounter;
}

export interface ImportSummary {
  source: 'chatgpt' | 'chatgpt-legacy' | 'claude' | 'chatbotui' | 'librechat';
  manifestVersion: number | null;
  conversations: number;
  shards: number;
  assets: number;
  assetBytes: number;
  archived: number;
  starred: number;
}

export interface ImportReport {
  imported: number;
  skipped: number;
  assetsImported: number;
  assetsUnavailable: number;
  errors: string[];
}

export type ImportJobStatus = 'active' | 'completed' | 'failed' | 'cancelled';

export interface ImportJob {
  jobId: string;
  userId: string;
  filepath: string;
  filename: string;
  phase: ImportPhase;
  status: ImportJobStatus;
  summary: ImportSummary | null;
  progress: ImportProgress;
  report: ImportReport | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ImportedCitations {
  turn: number;
  data: SearchResultData;
}
