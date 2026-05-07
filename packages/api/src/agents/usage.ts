import { logger } from '@librechat/data-schemas';
import { Providers } from 'librechat-data-provider';
import type { TCustomConfig, TTransactionsConfig } from 'librechat-data-provider';
import type {
  StructuredTokenUsage,
  BulkWriteDeps,
  PreparedEntry,
  TxMetadata,
  TokenUsage,
  PricingFns,
} from './transactions';
import type { UsageMetadata } from '~/stream/interfaces/IJobStore';
import type { EndpointTokenConfig } from '~/types/tokens';
import {
  prepareStructuredTokenSpend,
  bulkWriteTransactions,
  prepareTokenSpend,
} from './transactions';

type SpendTokensFn = (txData: TxMetadata, tokenUsage: TokenUsage) => Promise<unknown>;
type SpendStructuredTokensFn = (
  txData: TxMetadata,
  tokenUsage: StructuredTokenUsage,
) => Promise<unknown>;

/**
 * Providers whose `usage_metadata.input_tokens` ALREADY INCLUDES cached tokens
 * (i.e. `input_token_details.cache_*` is a subset, not an additional charge):
 *
 *   - Google / Vertex AI: `input_tokens` = `promptTokenCount` (includes `cachedContentTokenCount`)
 *   - OpenAI / Azure OpenAI: `input_tokens` = `prompt_tokens` (includes `prompt_tokens_details.cached_tokens`)
 *   - xAI, DeepSeek, OpenRouter, Moonshot: extend `ChatOpenAI`, same semantics
 *
 * Anthropic and Bedrock keep cache values separate from `input_tokens`, so they
 * must be added back to compute the total prompt size — that's the historical
 * additive default. Providers not listed here fall through to additive.
 */
const SUBSET_PROVIDERS: ReadonlySet<string> = new Set([
  Providers.OPENAI,
  Providers.AZURE,
  Providers.GOOGLE,
  Providers.VERTEXAI,
  Providers.XAI,
  Providers.DEEPSEEK,
  Providers.OPENROUTER,
  Providers.MOONSHOT,
]);

function inputTokensIncludesCache(provider?: string): boolean {
  return provider != null && SUBSET_PROVIDERS.has(provider);
}

interface SplitUsage {
  /** Non-cached input portion — what gets billed at the standard input rate */
  inputOnly: number;
  cacheCreation: number;
  cacheRead: number;
  /** Total prompt tokens including cached portion */
  totalInput: number;
}

function splitUsage(usage: UsageMetadata): SplitUsage {
  const cacheCreation =
    Number(usage.input_token_details?.cache_creation) ||
    Number(usage.cache_creation_input_tokens) ||
    0;
  const cacheRead =
    Number(usage.input_token_details?.cache_read) || Number(usage.cache_read_input_tokens) || 0;
  const rawInput = Number(usage.input_tokens) || 0;
  if (inputTokensIncludesCache(usage.provider)) {
    return {
      inputOnly: Math.max(0, rawInput - cacheCreation - cacheRead),
      cacheCreation,
      cacheRead,
      totalInput: rawInput,
    };
  }
  return {
    inputOnly: rawInput,
    cacheCreation,
    cacheRead,
    totalInput: rawInput + cacheCreation + cacheRead,
  };
}

export interface RecordUsageDeps {
  spendTokens: SpendTokensFn;
  spendStructuredTokens: SpendStructuredTokensFn;
  pricing?: PricingFns;
  bulkWriteOps?: BulkWriteDeps;
}

export interface RecordUsageParams {
  user: string;
  conversationId: string;
  collectedUsage: UsageMetadata[];
  model?: string;
  context?: string;
  messageId?: string;
  balance?: Partial<TCustomConfig['balance']> | null;
  transactions?: Partial<TTransactionsConfig>;
  endpointTokenConfig?: EndpointTokenConfig;
}

export interface RecordUsageResult {
  input_tokens: number;
  output_tokens: number;
}

/**
 * Records token usage for collected LLM calls and spends tokens against balance.
 * This handles both sequential execution (tool calls) and parallel execution (multiple agents).
 *
 * When `pricing` and `bulkWriteOps` deps are provided, prepares all transaction documents
 * in-memory first, then writes them in a single `insertMany` + one `updateBalance` call.
 */
export async function recordCollectedUsage(
  deps: RecordUsageDeps,
  params: RecordUsageParams,
): Promise<RecordUsageResult | undefined> {
  const {
    user,
    model,
    balance,
    messageId,
    transactions,
    conversationId,
    collectedUsage,
    endpointTokenConfig,
    context = 'message',
  } = params;

  if (!collectedUsage || !collectedUsage.length) {
    return;
  }

  const messageUsages: UsageMetadata[] = [];
  const summarizationUsages: UsageMetadata[] = [];
  for (const usage of collectedUsage) {
    if (usage == null) {
      continue;
    }
    (usage.usage_type === 'summarization' ? summarizationUsages : messageUsages).push(usage);
  }

  const firstUsage = messageUsages[0];
  const input_tokens = firstUsage == null ? 0 : splitUsage(firstUsage).totalInput;

  let total_output_tokens = 0;

  const { pricing, bulkWriteOps } = deps;
  const useBulk = pricing && bulkWriteOps;

  const processUsageGroup = (
    usages: UsageMetadata[],
    usageContext: string,
    docs: PreparedEntry[],
  ): void => {
    for (const usage of usages) {
      if (!usage) {
        continue;
      }

      const { inputOnly, cacheCreation, cacheRead } = splitUsage(usage);

      total_output_tokens += Number(usage.output_tokens) || 0;

      const txMetadata: TxMetadata = {
        user,
        balance,
        messageId,
        transactions,
        conversationId,
        endpointTokenConfig,
        context: usageContext,
        model: usage.model ?? model,
      };

      if (useBulk) {
        const entries =
          cacheCreation > 0 || cacheRead > 0
            ? prepareStructuredTokenSpend(
                txMetadata,
                {
                  promptTokens: {
                    input: inputOnly,
                    write: cacheCreation,
                    read: cacheRead,
                  },
                  completionTokens: usage.output_tokens,
                },
                pricing,
              )
            : prepareTokenSpend(
                txMetadata,
                {
                  promptTokens: inputOnly,
                  completionTokens: usage.output_tokens,
                },
                pricing,
              );
        docs.push(...entries);
        continue;
      }

      if (cacheCreation > 0 || cacheRead > 0) {
        deps
          .spendStructuredTokens(txMetadata, {
            promptTokens: {
              input: inputOnly,
              write: cacheCreation,
              read: cacheRead,
            },
            completionTokens: usage.output_tokens,
          })
          .catch((err) => {
            logger.error(
              `[packages/api #recordCollectedUsage] Error spending structured ${usageContext} tokens`,
              err,
            );
          });
        continue;
      }

      deps
        .spendTokens(txMetadata, {
          promptTokens: inputOnly,
          completionTokens: usage.output_tokens,
        })
        .catch((err) => {
          logger.error(
            `[packages/api #recordCollectedUsage] Error spending ${usageContext} tokens`,
            err,
          );
        });
    }
  };

  const allDocs: PreparedEntry[] = [];
  processUsageGroup(messageUsages, context, allDocs);
  processUsageGroup(summarizationUsages, 'summarization', allDocs);
  if (useBulk && allDocs.length > 0) {
    try {
      await bulkWriteTransactions({ user, docs: allDocs }, bulkWriteOps);
    } catch (err) {
      logger.error('[packages/api #recordCollectedUsage] Error in bulk write', err);
    }
  }

  return {
    input_tokens,
    output_tokens: total_output_tokens,
  };
}
