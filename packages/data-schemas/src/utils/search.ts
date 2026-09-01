/**
 * Escapes special characters in values used in MeiliSearch filter expressions.
 */
export const escapeMeiliFilterValue = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
