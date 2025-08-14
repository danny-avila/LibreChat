/**
 * Parses a number from a string with a fallback value.
 * Used primarily for parsing environment variables that should be numbers.
 *
 * If the input is already a number, it returns the number as is.
 * If the input is not a string or cannot be parsed as a number, returns the fallback value.
 *
 * @param str - The string to parse as a number, or a number.
 * @param fallbackValue - The default value to return if parsing fails.
 *
 * @returns The parsed number or the fallback value.
 */
export function math(str: string | number, fallbackValue?: number): number {
  const fallback = typeof fallbackValue !== 'undefined' && typeof fallbackValue === 'number';
  
  // If it's already a number, return it
  if (typeof str === 'number') {
    return str;
  }
  
  // If it's not a string, return fallback
  if (typeof str !== 'string') {
    if (fallback) {
      return fallbackValue;
    }
    throw new Error(`str is ${typeof str}, but should be a string`);
  }

  // Try to parse the string as a number
  const parsed = parseFloat(str.trim());
  
  // If parsing failed or result is NaN, return fallback
  if (isNaN(parsed)) {
    if (fallback) {
      return fallbackValue;
    }
    throw new Error(`[math] str "${str}" could not be parsed as a number`);
  }

  return parsed;
}