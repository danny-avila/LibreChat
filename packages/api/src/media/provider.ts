import type { MediaOperation, MediaConfig, MediaSubmissionRequest } from 'librechat-data-provider';
import type { Readable } from 'node:stream';
import type { MediaRoutingPolicy } from './routing';
import type { MediaTransport } from './transport';

export interface MediaConnection {
  id: string;
  api: MediaConfig['integrations'][number]['api'];
  baseURL: string;
  headers: Record<string, string>;
  binding: string;
  routing?: MediaRoutingPolicy;
}

export interface MediaProviderInput {
  role: MediaSubmissionRequest['inputs'][number]['role'];
  file_id: string;
  type: string;
  data: Buffer;
}

export type MediaProviderPart =
  | { kind: 'text'; ordinal: number; text: string; thoughtSignature?: string }
  | {
      kind: 'image' | 'video';
      ordinal: number;
      type: string;
      data?: Buffer;
      url?: string;
      thoughtSignature?: string;
    };

export interface MediaProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  costUSD?: number;
}

export type MediaProviderResult =
  | { status: 'running'; operationId: string; progress?: number }
  | { status: 'completed'; parts: MediaProviderPart[]; usage?: MediaProviderUsage }
  | { status: 'failed'; usage?: MediaProviderUsage }
  | { status: 'cancelled'; usage?: MediaProviderUsage };

export interface MediaProviderContext {
  transport: MediaTransport;
  connection: MediaConnection;
  config: MediaConfig;
  signal: AbortSignal;
  providerTag?: string;
  continuation?: { prompt: string; inputs: MediaProviderInput[]; parts: MediaProviderPart[] };
}

export interface MediaProviderAdapter {
  api: MediaConnection['api'];
  operations: readonly MediaOperation[];
  submit(
    request: MediaSubmissionRequest,
    inputs: MediaProviderInput[],
    context: MediaProviderContext,
  ): Promise<MediaProviderResult>;
  poll?(operationId: string, context: MediaProviderContext): Promise<MediaProviderResult>;
  download(
    part: Extract<MediaProviderPart, { kind: 'image' | 'video' }>,
    context: MediaProviderContext,
  ): Promise<Readable>;
}

export function mediaAPIURL(connection: MediaConnection, path: string): string {
  const base = new URL(
    connection.baseURL.endsWith('/') ? connection.baseURL : `${connection.baseURL}/`,
  );
  if (base.username || base.password || base.search || base.hash) {
    throw new Error('Media API roots cannot contain credentials, query parameters or fragments.');
  }
  return new URL(path.replace(/^\//, ''), base).href;
}
