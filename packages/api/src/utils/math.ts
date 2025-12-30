import { evaluate } from 'mathjs';

/**
 * Evaluates a mathematical expression provided as a string and returns the result.
 *
 * If the input is already a number, it returns the number as is.
 * If the input is not a string or contains invalid characters, an error is thrown.
 * If the evaluated result is not a number, an error is thrown.
 *
 * Uses mathjs for safe expression evaluation instead of eval().
 *
 * @param str - The mathematical expression to evaluate, or a number.
 * @param fallbackValue - The default value to return if the input is not a string or number, or if the evaluated result is not a number.
 *
 * @returns The result of the evaluated expression or the input number.
 *
 * @throws Throws an error if the input is not a string or number, contains invalid characters, or does not evaluate to a number.
 */
export function math(str: string | number | undefined, fallbackValue?: number): number {
  const fallback = fallbackValue != null;
  if (typeof str !== 'string' && typeof str === 'number') {
    return str;
  } else if (typeof str !== 'string') {
    if (fallback) {
      return fallbackValue;
    }
    throw new Error(`str is ${typeof str}, but should be a string`);
  }

  const validStr = /^[+\-\d.\s*/%()]+$/.test(str);

  if (!validStr) {
    if (fallback) {
      return fallbackValue;
    }
    throw new Error('Invalid characters in string');
  }

  try {
    const value = evaluate(str);

    if (typeof value !== 'number') {
      if (fallback) {
        return fallbackValue;
      }
      throw new Error(`[math] str did not evaluate to a number but to a ${typeof value}`);
    }

    return value;
  } catch (error) {
    if (fallback) {
      return fallbackValue;
    }
    const originalMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`[math] Error while evaluating mathematical expression: ${originalMessage}`);
  }
}
