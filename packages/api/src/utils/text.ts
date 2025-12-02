import { logger } from '@librechat/data-schemas';

/**
 * Processes text content by counting tokens and truncating if it exceeds the specified limit.
 * Uses ratio-based estimation to minimize expensive tokenCountFn calls.
 * @param text - The text content to process
 * @param tokenLimit - The maximum number of tokens allowed
 * @param tokenCountFn - Function to count tokens
 * @returns Promise resolving to object with processed text, token count, and truncation status
 */
export async function processTextWithTokenLimit({
  text,
  tokenLimit,
  tokenCountFn,
}: {
  text: string;
  tokenLimit: number;
  tokenCountFn: (text: string) => number;
}): Promise<{ text: string; tokenCount: number; wasTruncated: boolean }> {
  const originalTokenCount = await tokenCountFn(text);

  if (originalTokenCount <= tokenLimit) {
    return {
      text,
      tokenCount: originalTokenCount,
      wasTruncated: false,
    };
  }

  logger.debug(
    `[textTokenLimiter] Text content exceeds token limit: ${originalTokenCount} > ${tokenLimit}, truncating...`,
  );

  /** Use ratio-based estimation instead of binary search to minimize tokenCountFn calls */
  const ratio = tokenLimit / originalTokenCount;
  /** Apply 98% buffer to initial estimate to avoid overshooting */
  let charPosition = Math.floor(text.length * ratio * 0.98);

  let truncatedText = text.substring(0, charPosition);
  let tokenCount = await tokenCountFn(truncatedText);

  /** Refine if still over limit (should rarely need more than 1-2 iterations) */
  const maxIterations = 5;
  let iterations = 0;

  while (tokenCount > tokenLimit && iterations < maxIterations && charPosition > 0) {
    const overageRatio = tokenLimit / tokenCount;
    charPosition = Math.floor(charPosition * overageRatio * 0.98);
    truncatedText = text.substring(0, charPosition);
    tokenCount = await tokenCountFn(truncatedText);
    iterations++;
  }

  logger.warn(
    `[textTokenLimiter] Text truncated from ${originalTokenCount} to ${tokenCount} tokens (limit: ${tokenLimit})`,
  );

  return {
    text: truncatedText,
    tokenCount,
    wasTruncated: true,
  };
}
