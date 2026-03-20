import { logger } from '@librechat/data-schemas';

/** Token count function that can be sync or async */
export type TokenCountFn = (text: string) => number | Promise<number>;

/**
 * Safety buffer multiplier applied to character position estimates during truncation.
 *
 * We use 98% (0.98) rather than 100% to intentionally undershoot the target on the first attempt.
 * This is necessary because:
 * - Token density varies across text (some regions may have more tokens per character than the average)
 * - The ratio-based estimate assumes uniform token distribution, which is rarely true
 * - Undershooting is safer than overshooting: exceeding the limit requires another iteration,
 *   while being slightly under is acceptable
 * - In practice, this buffer reduces refinement iterations from 2-3 down to 0-1 in most cases
 *
 * @example
 * // If text has 1000 chars and 250 tokens (4 chars/token average), targeting 100 tokens:
 * // Without buffer: estimate = 1000 * (100/250) = 400 chars → might yield 105 tokens (over!)
 * // With 0.98 buffer: estimate = 400 * 0.98 = 392 chars → likely yields 97-99 tokens (safe)
 */
const TRUNCATION_SAFETY_BUFFER = 0.98;

/**
 * Processes text content by counting tokens and truncating if it exceeds the specified limit.
 * Uses ratio-based estimation to minimize expensive tokenCountFn calls.
 *
 * @param text - The text content to process
 * @param tokenLimit - The maximum number of tokens allowed
 * @param tokenCountFn - Function to count tokens (can be sync or async)
 * @returns Promise resolving to object with processed text, token count, and truncation status
 *
 * @remarks
 * This function uses a ratio-based estimation algorithm instead of binary search.
 * Binary search would require O(log n) tokenCountFn calls (~17 for 100k chars),
 * while this approach typically requires only 2-3 calls for a 90%+ reduction in CPU usage.
 */
export async function processTextWithTokenLimit({
  text,
  tokenLimit,
  tokenCountFn,
}: {
  text: string;
  tokenLimit: number;
  tokenCountFn: TokenCountFn;
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

  const ratio = tokenLimit / originalTokenCount;
  let charPosition = Math.floor(text.length * ratio * TRUNCATION_SAFETY_BUFFER);

  let truncatedText = text.substring(0, charPosition);
  let tokenCount = await tokenCountFn(truncatedText);

  const maxIterations = 5;
  let iterations = 0;

  while (tokenCount > tokenLimit && iterations < maxIterations && charPosition > 0) {
    const overageRatio = tokenLimit / tokenCount;
    charPosition = Math.floor(charPosition * overageRatio * TRUNCATION_SAFETY_BUFFER);
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
