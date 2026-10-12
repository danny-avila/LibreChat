import sharp from 'sharp';
import getStream from 'get-stream';
import {
  Constants,
  FileContext,
  FileSources,
  messageFilterPiiSchema,
} from 'librechat-data-provider';
import type { TAgentsEndpoint } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest, StrategyFunctions } from '~/types';
import { assertModelBoundContent } from '~/middleware/modelBoundContent';
import { AttachmentStorageError } from '~/files/encode/image';
import { filterFilesByEndpointConfig } from '~/files/filter';
import { AgentAttachmentLimitError } from '../attachments';
import { resolveDownloadPath } from '~/storage/path';

type ReplayConfig = NonNullable<TAgentsEndpoint['historicalToolImages']>;
type HistoryMessage = {
  messageId?: string;
  conversationId?: string | null;
  isCreatedByUser?: boolean;
  attachments?: { file_id?: string; toolCallId?: string; messageId?: string }[];
  files?: { file_id?: string }[];
  content?: { type?: string; tool_call?: { id?: string; name?: string }; agentId?: string }[];
};
type ReplayPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: 'auto' } };
type ReplayDependencies = {
  getStrategyFunctions: (source: string) => StrategyFunctions;
  countTokens: (content: ReplayPart[]) => number;
  admit: (files: IMongoFile[]) => void;
};

/** Records come from the existing owner/tenant query; snapshots never supply paths or bytes. */
export function selectHistoricalToolImages({
  messages,
  filesById,
  config,
  model,
  conversationId,
  agentId,
  currentFileIds = new Set<string>(),
}: {
  messages: readonly HistoryMessage[];
  filesById?: ReadonlyMap<string, IMongoFile>;
  config?: ReplayConfig;
  model?: string;
  conversationId?: string;
  agentId?: string;
  currentFileIds?: ReadonlySet<string>;
}): { file: IMongoFile; messageId: string; toolCallId: string }[] {
  if (!config?.enabled || !model || !config.models.includes(model) || !conversationId) return [];
  const selected: { file: IMongoFile; messageId: string; toolCallId: string }[] = [];
  const seen = new Set(currentFileIds);
  let turns = 0;
  let bytes = 0;
  // The last row is the current user turn. Walk only the configured recent completed turns.
  for (let i = messages.length - 2; i >= 0; i--) {
    const message = messages[i];
    if (message.isCreatedByUser) {
      if (++turns >= config.recentTurns) break;
      continue;
    }
    if (!message.messageId || message.conversationId !== conversationId) continue;
    const toolIds = new Set(
      (message.content ?? [])
        .filter(
          (part) =>
            part.type === 'tool_call' &&
            part.tool_call?.name?.includes(Constants.mcp_delimiter) &&
            (!part.agentId || part.agentId === agentId),
        )
        .map((part) => part.tool_call?.id),
    );
    for (const ref of [...(message.attachments ?? [])].reverse()) {
      if (
        !ref.file_id ||
        seen.has(ref.file_id) ||
        !ref.toolCallId ||
        !toolIds.has(ref.toolCallId) ||
        ref.messageId !== message.messageId
      )
        continue;
      const file = filesById?.get(ref.file_id);
      if (
        !file ||
        (file.conversationId != null && file.conversationId !== conversationId) ||
        (file.messageId != null && file.messageId !== message.messageId) ||
        file.context !== FileContext.image_generation ||
        file.llmDeliveryPath === 'none' ||
        !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
        !Number.isFinite(file.bytes) ||
        file.bytes <= 0 ||
        file.bytes > config.maxSourceBytes ||
        bytes + file.bytes > config.maxTotalSourceBytes
      )
        continue;
      selected.push({ file, messageId: message.messageId, toolCallId: ref.toolCallId });
      seen.add(ref.file_id);
      bytes += file.bytes;
      if (selected.length >= config.maxImages) return selected.reverse();
    }
  }
  return selected.reverse();
}

/** Bounded storage reads, private in-memory previews, and prompt-only projection. */
export async function replayHistoricalToolImages({
  req,
  messages,
  filesById,
  model,
  conversationId,
  agentId,
  endpoint,
  endpointType,
  currentFiles = [],
  deps,
}: {
  req: ServerRequest;
  messages: readonly HistoryMessage[];
  filesById?: ReadonlyMap<string, IMongoFile>;
  model?: string;
  conversationId?: string;
  agentId?: string;
  endpoint?: string;
  endpointType?: string;
  currentFiles?: IMongoFile[];
  deps: ReplayDependencies;
}): Promise<{ content: ReplayPart[]; files: IMongoFile[] }> {
  const config = req.config?.endpoints?.agents?.historicalToolImages;
  const selected = selectHistoricalToolImages({
    messages,
    filesById,
    config,
    model,
    conversationId,
    agentId,
    currentFileIds: new Set(currentFiles.map((file) => file.file_id)),
  });
  const result: { content: ReplayPart[]; files: IMongoFile[] } = { content: [], files: [] };
  if (!config || selected.length === 0) return result;
  const allowed = new Set(
    filterFilesByEndpointConfig(req, {
      files: [...currentFiles, ...selected.map(({ file }) => file)],
      endpoint,
      endpointType,
    }).map((file) => file.file_id),
  );
  let totalBytes = 0;
  for (const { file, messageId, toolCallId } of selected) {
    if (!allowed.has(file.file_id)) continue;
    assertModelBoundContent({
      filters: req.config?.filters,
      legacyPii: req.config?.messageFilter?.pii
        ? messageFilterPiiSchema.parse(req.config.messageFilter.pii)
        : undefined,
      files: [file],
      resolvedFiles: [file],
    });
    const source = file.source ?? FileSources.local;
    let input: Buffer;
    try {
      const stream = await deps
        .getStrategyFunctions(source)
        .getDownloadStream(req, resolveDownloadPath(file));
      input = await getStream.buffer(stream, {
        maxBuffer: Math.min(config.maxSourceBytes, config.maxTotalSourceBytes - totalBytes),
      });
    } catch (error) {
      if (typeof error === 'object' && error != null && 'bufferedData' in error) {
        delete error.bufferedData;
        continue;
      }
      if (
        typeof error === 'object' &&
        error != null &&
        'code' in error &&
        (error.code === 'ENOENT' || error.code === 'NoSuchKey')
      )
        continue;
      if (
        typeof error === 'object' &&
        error != null &&
        '$metadata' in error &&
        typeof error.$metadata === 'object' &&
        error.$metadata != null &&
        'httpStatusCode' in error.$metadata &&
        error.$metadata.httpStatusCode === 404
      )
        continue;
      throw new AttachmentStorageError();
    }
    totalBytes += input.length;
    let preview: Buffer;
    let width: number;
    let height: number;
    try {
      const rendered = await sharp(input, {
        limitInputPixels: config.maxSourcePixels,
        animated: false,
      })
        .rotate()
        .resize(config.previewMaxEdge, config.previewMaxEdge, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer({ resolveWithObject: true });
      preview = rendered.data;
      width = rendered.info.width;
      height = rendered.info.height;
    } catch {
      continue; // Corrupt or excessive decoded input is an expected historical omission.
    }
    if (preview.length > config.maxPreviewBytes) continue;
    const content: ReplayPart[] = [
      {
        type: 'text',
        text: `Historical MCP image (preview): ${JSON.stringify({ messageId, toolCallId, fileId: file.file_id }).slice(0, 1024)}.`,
      },
      {
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${preview.toString('base64')}`, detail: 'auto' },
      },
    ];
    if (deps.countTokens([...result.content, ...content]) > config.maxTokens) continue;
    const previewFile = {
      ...file,
      type: 'image/png',
      width,
      height,
      bytes: preview.length,
      llmDeliveryPath: 'provider' as const,
    };
    try {
      deps.admit([...currentFiles, ...result.files, previewFile]);
    } catch (error) {
      if (error instanceof AgentAttachmentLimitError) continue;
      throw error;
    }
    result.files.push(previewFile);
    result.content.push(...content);
  }
  if (result.files.length < selected.length) {
    const omission: ReplayPart = {
      type: 'text',
      text: 'Some historical MCP image previews were unavailable or exceeded replay limits. Reopen the original images if visual details are needed.',
    };
    if (deps.countTokens([...result.content, omission]) <= config.maxTokens) {
      result.content.push(omission);
    }
  }
  return result;
}

/** Append only to the prompt copy; memory, stored messages, and canonical counts stay unchanged. */
export async function appendHistoricalToolImageContext({
  payload,
  indexTokenCountMap,
  resendFiles,
  ...options
}: Parameters<typeof replayHistoricalToolImages>[0] & {
  payload: { role: string; content: string | ReplayPart[] }[];
  indexTokenCountMap: Record<number, number>;
  resendFiles?: boolean;
}): Promise<number> {
  const lastIndex = payload.length - 1;
  const last = payload[lastIndex];
  if (resendFiles === false || !last || last.role !== 'user') return 0;
  const replay = await replayHistoricalToolImages(options);
  if (replay.content.length === 0) return 0;
  const before =
    typeof last.content === 'string'
      ? [{ type: 'text' as const, text: last.content }]
      : last.content;
  const after = [...replay.content, ...before];
  assertModelBoundContent({
    filters: options.req.config?.filters,
    legacyPii: options.req.config?.messageFilter?.pii
      ? messageFilterPiiSchema.parse(options.req.config.messageFilter.pii)
      : undefined,
    submittedMessages: [{ role: 'user', content: replay.content }],
    files: replay.files,
    resolvedFiles: replay.files,
  });
  const delta = Math.max(0, options.deps.countTokens(after) - options.deps.countTokens(before));
  last.content = after;
  indexTokenCountMap[lastIndex] = (indexTokenCountMap[lastIndex] ?? 0) + delta;
  return delta;
}
