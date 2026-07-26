import { EModelEndpoint } from 'librechat-data-provider';
import type { SaveMessageDetails, RunImportInput, ProviderImportContext } from '~/import/sink';
import type { GrokExport, ImportProgress, GrokConversationEntry } from '~/import/types';
import type { ConvertedGrokConversation } from './convert';
import type { Archive } from '~/import/archive';
import { sanitizeImportError } from '~/import/errors';
import { convertGrokConversation } from './convert';
import { isGrokExport } from '~/import/manifest';

export const GROK_SOURCE = 'grok';

/**
 * xAI has no first-class `EModelEndpoint`: it is only reachable as a `custom`
 * endpoint whose name each deployment chooses in `librechat.yaml`, so a
 * conversation stamped with it would fail endpoint and model validation
 * anywhere xAI is not configured. Imported Grok conversations therefore carry
 * the deployment-universal OpenAI endpoint — the same choice the ChatGPT and
 * ChatbotUI paths make — while each message keeps its raw Grok model slug.
 */
export const GROK_ENDPOINT: EModelEndpoint = EModelEndpoint.openAI;

class ShardShapeError extends Error {}

async function parseShard(archive: Archive, shard: string): Promise<GrokExport> {
  const parsed: unknown = JSON.parse((await archive.read(shard)).toString('utf8'));
  if (!isGrokExport(parsed)) {
    throw new ShardShapeError('expected a Grok export object');
  }
  return parsed;
}

function describeShardError(error: unknown, shard: string): string {
  if (error instanceof ShardShapeError) {
    return error.message;
  }
  return sanitizeImportError(error, `import shard ${shard}`);
}

function toSaveMessageDetails(
  message: ConvertedGrokConversation['messages'][number],
): SaveMessageDetails {
  return {
    messageId: message.messageId,
    parentMessageId: message.parentMessageId,
    text: message.text,
    sender: message.sender,
    isCreatedByUser: message.isCreatedByUser,
    model: message.model,
    createdAt: message.createdAt,
    endpoint: GROK_ENDPOINT,
  };
}

/**
 * Converts one conversation and writes it to the batch sink, kept separate from
 * the run loop so a thrown conversion or write error is caught per conversation
 * rather than aborting the remaining ones.
 */
export function writeGrokConversation(
  entry: GrokConversationEntry,
  input: RunImportInput,
): ConvertedGrokConversation {
  const converted = convertGrokConversation(entry, { defaultModel: input.defaultModel });

  input.batch.startConversation(GROK_ENDPOINT);
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
      importedFrom: { source: GROK_SOURCE, externalId: converted.externalId },
    },
    converted.model,
  );

  return converted;
}

/**
 * Runs a Grok export through the same job pipeline ChatGPT and Claude exports
 * use.
 *
 * There is no asset phase: the binaries a Grok export ships belong to its
 * `media_posts` (Grok Imagine generations), which no conversation references, so
 * there is nothing for conversations to resolve and nothing to pre-scan. Each
 * shard is read exactly once and its conversation count folded into the progress
 * total as it is converted.
 */
export async function runGrokImport(context: ProviderImportContext): Promise<void> {
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

    let parsed: GrokExport;
    try {
      parsed = await parseShard(archive, shard);
    } catch (error) {
      report.errors.push(`${shard}: ${describeShardError(error, shard)}`);
      continue;
    }

    progress.conversations.total += parsed.conversations.length;

    for (const entry of parsed.conversations) {
      if (input.isCancelled && (await input.isCancelled())) {
        cancelled = true;
        break;
      }

      let externalId = '';
      try {
        externalId = entry.conversation.id;
        if (input.existingExternalIds.has(externalId)) {
          report.skipped += 1;
        } else {
          const converted = writeGrokConversation(entry, input);
          progress.messages.done += converted.messages.length;
          report.imported += 1;
        }
      } catch (error) {
        const label = externalId || 'conversation';
        report.errors.push(`${label}: ${sanitizeImportError(error, `import ${label}`)}`);
      }

      progress.conversations.done += 1;
      await input.batch.maybeFlush();
      await input.onProgress?.(progress);
    }
  }

  await input.batch.saveBatch();
}
