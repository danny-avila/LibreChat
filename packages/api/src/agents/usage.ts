import { logger } from '@librechat/data-schemas';
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

  const firstUsage = collectedUsage[0];
  const input_tokens =
    (firstUsage?.input_tokens || 0) +
    (Number(firstUsage?.input_token_details?.cache_creation) ||
      Number(firstUsage?.cache_creation_input_tokens) ||
      0) +
    (Number(firstUsage?.input_token_details?.cache_read) ||
      Number(firstUsage?.cache_read_input_tokens) ||
      0);

  let total_output_tokens = 0;

  const { pricing, bulkWriteOps } = deps;
  const useBulk = pricing && bulkWriteOps;

  const allDocs: PreparedEntry[] = [];

  for (const usage of collectedUsage) {
    if (!usage) {
      continue;
    }

    const cache_creation =
      Number(usage.input_token_details?.cache_creation) ||
      Number(usage.cache_creation_input_tokens) ||
      0;
    const cache_read =
      Number(usage.input_token_details?.cache_read) || Number(usage.cache_read_input_tokens) || 0;

    total_output_tokens += Number(usage.output_tokens) || 0;

    const txMetadata: TxMetadata = {
      user,
      context,
      balance,
      messageId,
      transactions,
      conversationId,
      endpointTokenConfig,
      model: usage.model ?? model,
    };

    if (useBulk) {
      const entries =
        cache_creation > 0 || cache_read > 0
          ? prepareStructuredTokenSpend(
              txMetadata,
              {
                promptTokens: {
                  input: usage.input_tokens,
                  write: cache_creation,
                  read: cache_read,
                },
                completionTokens: usage.output_tokens,
              },
              pricing,
            )
          : prepareTokenSpend(
              txMetadata,
              {
                promptTokens: usage.input_tokens,
                completionTokens: usage.output_tokens,
              },
              pricing,
            );
      allDocs.push(...entries);
      continue;
    }

    if (cache_creation > 0 || cache_read > 0) {
      deps
        .spendStructuredTokens(txMetadata, {
          promptTokens: {
            input: usage.input_tokens,
            write: cache_creation,
            read: cache_read,
          },
          completionTokens: usage.output_tokens,
        })
        .catch((err) => {
          logger.error(
            '[packages/api #recordCollectedUsage] Error spending structured tokens',
            err,
          );
        });
      continue;
    }

    deps
      .spendTokens(txMetadata, {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
      })
      .catch((err) => {
        logger.error('[packages/api #recordCollectedUsage] Error spending tokens', err);
      });
  }

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
