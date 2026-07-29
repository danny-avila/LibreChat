import { EModelEndpoint } from 'librechat-data-provider';
import type { SaveMessageDetails, RunImportInput, ProviderImportContext } from '~/import/sink';
import type { ClaudeConversation, ImportProgress } from '~/import/types';
import type { ConvertedClaudeConversation } from './convert';
import type { Archive } from '~/import/archive';
import { recordError, sanitizeImportError } from '~/import/errors';
import { hasClaudeConversationShape } from '~/import/manifest';
import { convertClaudeConversation } from './convert';

export const CLAUDE_SOURCE = 'claude';

export type ClaudeImportContext = ProviderImportContext;

class ShardShapeError extends Error {}

/**
 * Reads and validates one Claude shard. Neither pass retains the result: the
 * counting pass and the conversion pass each drop the parsed array as soon as
 * they are done with it, so peak heap stays at one shard rather than the whole
 * export.
 */
async function parseShard(archive: Archive, shard: string): Promise<ClaudeConversation[]> {
  const parsed: unknown = JSON.parse((await archive.read(shard)).toString('utf8'));
  if (!Array.isArray(parsed)) {
    throw new ShardShapeError('expected an array of conversations');
  }
  if (!hasClaudeConversationShape(parsed)) {
    throw new ShardShapeError('expected Claude conversation objects');
  }
  return parsed as ClaudeConversation[];
}

function describeShardError(error: unknown, shard: string): string {
  if (error instanceof ShardShapeError) {
    return error.message;
  }
  return sanitizeImportError(error, `import shard ${shard}`);
}

function toSaveMessageDetails(
  message: ConvertedClaudeConversation['messages'][number],
): SaveMessageDetails {
  return {
    messageId: message.messageId,
    parentMessageId: message.parentMessageId,
    text: message.text,
    sender: message.sender,
    isCreatedByUser: message.isCreatedByUser,
    model: message.model,
    createdAt: message.createdAt,
    endpoint: EModelEndpoint.anthropic,
    content: message.content,
    attachments: message.attachments,
  };
}

/**
 * Converts one conversation and writes it to the batch sink, kept separate from
 * the run loop so a thrown conversion or write error is caught per conversation
 * rather than aborting the remaining ones.
 */
export function writeConversation(
  conv: ClaudeConversation,
  input: RunImportInput,
): ConvertedClaudeConversation {
  const converted = convertClaudeConversation(conv, { defaultModel: input.defaultModel });

  input.batch.startConversation(EModelEndpoint.anthropic);
  for (const message of converted.messages) {
    input.batch.saveMessage(toSaveMessageDetails(message));
  }
  input.batch.finishConversation(
    converted.title,
    converted.createdAt,
    {
      isArchived: converted.isArchived,
      pinned: converted.pinned,
      model: converted.model,
      importedFrom: { source: CLAUDE_SOURCE, externalId: converted.externalId },
    },
    converted.model,
  );

  return converted;
}

/**
 * Runs a Claude export through the same job pipeline ChatGPT exports use.
 *
 * There is no asset phase: a Claude export ships no binaries at all, so every
 * file and image a conversation references is counted as unavailable instead.
 * Without assets to resolve up front there is also nothing to pre-scan, so each
 * shard is read exactly once and its conversation count folded into the progress
 * total as it is converted — a single 86 MB `conversations.json` is never parsed
 * twice just to learn its length.
 */
export async function runClaudeImport(context: ProviderImportContext): Promise<void> {
  const { archive, input, report } = context;

  const progress: ImportProgress = {
    conversations: { done: 0, total: 0 },
    messages: { done: 0, total: 0 },
    assets: { done: 0, total: 0 },
  };

  await input.onPhase?.('conversations');

  let cancelled = false;
  for (const shard of context.shards) {
    if (cancelled) {
      break;
    }

    let conversations: ClaudeConversation[];
    try {
      conversations = await parseShard(archive, shard);
    } catch (error) {
      recordError(report.errors, `${shard}: ${describeShardError(error, shard)}`);
      continue;
    }

    progress.conversations.total += conversations.length;

    for (const conv of conversations) {
      if (input.isCancelled && (await input.isCancelled())) {
        cancelled = true;
        break;
      }

      if (input.existingExternalIds.has(conv.uuid)) {
        report.skipped += 1;
        progress.conversations.done += 1;
        await input.onProgress?.(progress);
        continue;
      }

      try {
        const converted = writeConversation(conv, input);
        progress.messages.done += converted.messages.length;
        report.assetsImported += converted.extracted;
        report.assetsUnavailable += converted.unavailable;
        report.imported += 1;
        /** The skip set is a snapshot taken at job start, so a uuid repeated
         * within one export would otherwise import twice. */
        input.existingExternalIds.add(conv.uuid);
      } catch (error) {
        recordError(
          report.errors,
          `${conv.uuid}: ${sanitizeImportError(error, `import conversation ${conv.uuid}`)}`,
        );
      }

      progress.conversations.done += 1;
      await input.batch.maybeFlush();
      await input.onProgress?.(progress);
    }
  }

  await input.batch.saveBatch();
}
