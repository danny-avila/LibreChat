import logger from '~/config/winston';

export function createSpendTokensMethods(
  _mongoose: typeof import('mongoose'),
  transactionMethods: {
    createTransaction: (
      txData: Record<string, unknown>,
    ) => Promise<Record<string, unknown> | undefined>;
    createStructuredTransaction: (
      txData: Record<string, unknown>,
    ) => Promise<Record<string, unknown> | undefined>;
  },
) {
  /**
   * Creates up to two transactions to record the spending of tokens.
   */
  async function spendTokens(
    txData: Record<string, unknown>,
    tokenUsage: { promptTokens?: number; completionTokens?: number },
  ) {
    const { promptTokens, completionTokens } = tokenUsage;
    logger.debug(
      `[spendTokens] conversationId: ${txData.conversationId}${
        txData?.context ? ` | Context: ${txData?.context}` : ''
      } | Token usage: `,
      { promptTokens, completionTokens },
    );
    let prompt: Record<string, unknown> | undefined,
      completion: Record<string, unknown> | undefined;
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
    txData: Record<string, unknown>,
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
    let prompt: Record<string, unknown> | undefined,
      completion: Record<string, unknown> | undefined;
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

  return { spendTokens, spendStructuredTokens };
}

export type SpendTokensMethods = ReturnType<typeof createSpendTokensMethods>;
