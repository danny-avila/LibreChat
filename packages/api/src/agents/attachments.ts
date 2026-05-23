import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest } from '~/types';
import type { TokenCountFn } from '~/utils/text';
import { countTokens } from '~/utils/tokenizer';
import { extractFileContext } from '~/files';

type FileWithId = {
  file_id?: string | null;
};

export type AgentContextAttachmentCarrier<TFile extends FileWithId = IMongoFile> = {
  id?: string | null;
  agentContextAttachments?: TFile[] | null;
};

export type AgentContextAttachmentsByAgentId<TFile extends FileWithId = IMongoFile> =
  | Map<string, TFile[]>
  | Record<string, TFile[] | undefined>
  | null
  | undefined;

export function collectFileIds<TFile extends FileWithId>(
  files?: Array<TFile | null | undefined> | null,
): Set<string> {
  const fileIds = new Set<string>();
  for (const file of files ?? []) {
    if (file?.file_id) {
      fileIds.add(file.file_id);
    }
  }
  return fileIds;
}

export function buildAgentContextAttachmentsByAgentId<TFile extends FileWithId>(
  configs: Iterable<AgentContextAttachmentCarrier<TFile> | null | undefined>,
): Map<string, TFile[]> {
  const attachmentsByAgentId = new Map<string, TFile[]>();

  for (const config of configs) {
    if (!config?.id || !Array.isArray(config.agentContextAttachments)) {
      continue;
    }
    if (config.agentContextAttachments.length === 0) {
      continue;
    }
    attachmentsByAgentId.set(config.id, config.agentContextAttachments);
  }

  return attachmentsByAgentId;
}

export function getAgentContextAttachments<TFile extends FileWithId>({
  agentId,
  attachmentsByAgentId,
  excludeFileIds,
}: {
  agentId: string;
  attachmentsByAgentId: AgentContextAttachmentsByAgentId<TFile>;
  excludeFileIds?: Set<string>;
}): TFile[] {
  if (!attachmentsByAgentId) {
    return [];
  }

  const attachments: TFile[] =
    attachmentsByAgentId instanceof Map
      ? (attachmentsByAgentId.get(agentId) ?? [])
      : (attachmentsByAgentId[agentId] ?? []);

  if (!excludeFileIds || excludeFileIds.size === 0) {
    return attachments;
  }

  return attachments.filter((file) => !file?.file_id || !excludeFileIds.has(file.file_id));
}

export async function buildAgentScopedContext({
  agentIds,
  attachmentsByAgentId,
  sharedRunAttachmentIds,
  req,
  tokenCountFn = countTokens,
}: {
  agentIds: string[];
  attachmentsByAgentId: AgentContextAttachmentsByAgentId<IMongoFile>;
  sharedRunAttachmentIds?: Set<string>;
  req?: ServerRequest;
  tokenCountFn?: TokenCountFn;
}): Promise<Map<string, string>> {
  const uniqueAgentIds = Array.from(new Set(agentIds.filter(Boolean)));
  const entries = await Promise.all(
    uniqueAgentIds.map(async (agentId) => {
      const attachments = getAgentContextAttachments({
        agentId,
        attachmentsByAgentId,
        excludeFileIds: sharedRunAttachmentIds,
      });
      if (attachments.length === 0) {
        return [agentId, ''] as const;
      }

      const context = await extractFileContext({
        attachments,
        req,
        tokenCountFn,
      });
      return [agentId, context ?? ''] as const;
    }),
  );

  return new Map(entries.filter(([, context]) => Boolean(context)));
}
