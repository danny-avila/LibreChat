import { logger } from '@librechat/data-schemas';

/**
 * Processes text content by counting tokens and truncating if it exceeds the specified limit.
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

  /**
   * Doing binary search here to find the truncation point efficiently
   * (May be a better way to go about this)
   */
  let low = 0;
  let high = text.length;
  let bestText = '';

  logger.debug(
    `[textTokenLimiter] Text content exceeds token limit: ${originalTokenCount} > ${tokenLimit}, truncating...`,
  );

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const truncatedText = text.substring(0, mid);
    const tokenCount = await tokenCountFn(truncatedText);

    if (tokenCount <= tokenLimit) {
      bestText = truncatedText;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const finalTokenCount = await tokenCountFn(bestText);

  logger.warn(
    `[textTokenLimiter] Text truncated from ${originalTokenCount} to ${finalTokenCount} tokens (limit: ${tokenLimit})`,
  );

  return {
    text: bestText,
    tokenCount: finalTokenCount,
    wasTruncated: true,
  };
}
