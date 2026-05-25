import logger from '~/config/winston';
import type { MediaTokenType } from './tx';
import type { TxData, TransactionResult } from './transaction';

/** Single non-text usage event (one second of audio, one page of OCR, one image). */
export interface MediaUsage {
  type: MediaTokenType;
  amount: number;
}

/** Base transaction context passed by callers — does not include fields added internally */
export interface SpendTxData {
  user: string | import('mongoose').Types.ObjectId;
  conversationId?: string;
  model?: string;
  context?: string;
  endpointTokenConfig?: Record<string, Record<string, number>> | null;
  balance?: { enabled?: boolean };
  transactions?: { enabled?: boolean };
  valueKey?: string;
}

export function createSpendTokensMethods(
  _mongoose: typeof import('mongoose'),
  transactionMethods: {
    createTransaction: (txData: TxData) => Promise<TransactionResult | undefined>;
    createStructuredTransaction: (txData: TxData) => Promise<TransactionResult | undefined>;
  },
) {
  /**
   * Creates up to two transactions to record the spending of tokens.
   */
  async function spendTokens(
    txData: SpendTxData,
    tokenUsage: { promptTokens?: number; completionTokens?: number },
  ) {
    const { promptTokens, completionTokens } = tokenUsage;
    logger.debug(
      `[spendTokens] conversationId: ${txData.conversationId}${
        txData?.context ? ` | Context: ${txData?.context}` : ''
      } | Token usage: `,
      { promptTokens, completionTokens },
    );
    let prompt: TransactionResult | undefined, completion: TransactionResult | undefined;
    const normalizedPromptTokens = Math.max(promptTokens ?? 0, 0);
    try {
      if (promptTokens !== undefined) {
        prompt = await transactionMethods.createTransaction({
          ...txData,
          tokenType: 'prompt',
          rawAmount: promptTokens === 0 ? 0 : -normalizedPromptTokens,
          inputTokenCount: normalizedPromptTokens,
        });
      }

      if (completionTokens !== undefined) {
        completion = await transactionMethods.createTransaction({
          ...txData,
          tokenType: 'completion',
          rawAmount: completionTokens === 0 ? 0 : -Math.max(completionTokens, 0),
          inputTokenCount: normalizedPromptTokens,
        });
      }

      if (prompt || completion) {
        logger.debug('[spendTokens] Transaction data record against balance:', {
          user: txData.user,
          prompt: prompt?.prompt,
          promptRate: prompt?.rate,
          completion: completion?.completion,
          completionRate: completion?.rate,
          balance: completion?.balance ?? prompt?.balance,
        });
      } else {
        logger.debug('[spendTokens] No transactions incurred against balance');
      }
    } catch (err) {
      logger.error('[spendTokens]', err);
    }
  }

  /**
   * Creates transactions to record the spending of structured tokens.
   */
  async function spendStructuredTokens(
    txData: SpendTxData,
    tokenUsage: {
      promptTokens?: { input?: number; write?: number; read?: number };
      completionTokens?: number;
    },
  ) {
    const { promptTokens, completionTokens } = tokenUsage;
    logger.debug(
      `[spendStructuredTokens] conversationId: ${txData.conversationId}${
        txData?.context ? ` | Context: ${txData?.context}` : ''
      } | Token usage: `,
      { promptTokens, completionTokens },
    );
    let prompt: TransactionResult | undefined, completion: TransactionResult | undefined;
    try {
      if (promptTokens) {
        const input = Math.max(promptTokens.input ?? 0, 0);
        const write = Math.max(promptTokens.write ?? 0, 0);
        const read = Math.max(promptTokens.read ?? 0, 0);
        const totalInputTokens = input + write + read;
        prompt = await transactionMethods.createStructuredTransaction({
          ...txData,
          tokenType: 'prompt',
          inputTokens: -input,
          writeTokens: -write,
          readTokens: -read,
          inputTokenCount: totalInputTokens,
        });
      }

      if (completionTokens) {
        const totalInputTokens = promptTokens
          ? Math.max(promptTokens.input ?? 0, 0) +
            Math.max(promptTokens.write ?? 0, 0) +
            Math.max(promptTokens.read ?? 0, 0)
          : undefined;
        completion = await transactionMethods.createTransaction({
          ...txData,
          tokenType: 'completion',
          rawAmount: -Math.max(completionTokens, 0),
          inputTokenCount: totalInputTokens,
        });
      }

      if (prompt || completion) {
        logger.debug('[spendStructuredTokens] Transaction data record against balance:', {
          user: txData.user,
          prompt: prompt?.prompt,
          promptRate: prompt?.rate,
          completion: completion?.completion,
          completionRate: completion?.rate,
          balance: completion?.balance ?? prompt?.balance,
        });
      } else {
        logger.debug('[spendStructuredTokens] No transactions incurred against balance');
      }
    } catch (err) {
      logger.error('[spendStructuredTokens]', err);
    }

    return { prompt, completion };
  }

  /**
   * Records a single transaction for non-text usage — STT (audio_input/sec),
   * TTS (audio_output/char), OCR (ocr_pages), image-gen (image_count).
   *
   * Sign convention matches `spendTokens`: rawAmount is stored negative so
   * `tokenValue = rawAmount × multiplier` produces a negative credit debit.
   * Zero/negative/non-finite `amount` is treated as a no-op.
   */
  async function spendMediaTokens(
    txData: SpendTxData,
    usage: MediaUsage,
  ): Promise<TransactionResult | undefined> {
    if (!usage || !Number.isFinite(usage.amount) || usage.amount <= 0) {
      return;
    }
    if (!txData.user) {
      logger.warn('[spendMediaTokens] no user; skipping');
      return;
    }
    logger.debug(
      `[spendMediaTokens] conversationId: ${txData.conversationId}${
        txData?.context ? ` | Context: ${txData?.context}` : ''
      } | type=${usage.type} amount=${usage.amount} model=${txData.model}`,
    );
    try {
      const result = await transactionMethods.createTransaction({
        ...txData,
        tokenType: usage.type,
        rawAmount: -usage.amount,
      });
      if (result) {
        logger.debug('[spendMediaTokens] Transaction recorded', {
          user: String(txData.user),
          type: usage.type,
          rate: result.rate,
          balance: result.balance,
        });
      }
      return result;
    } catch (err) {
      logger.error('[spendMediaTokens]', err);
    }
  }

  return { spendTokens, spendStructuredTokens, spendMediaTokens };
}

export type SpendTokensMethods = ReturnType<typeof createSpendTokensMethods>;
