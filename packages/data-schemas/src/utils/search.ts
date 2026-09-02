/**
 * Escapes backslashes and double quotes in MeiliSearch string filter values.
 */
export const escapeMeiliFilterValue = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
