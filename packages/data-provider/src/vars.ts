import { z } from 'zod';

/**
 * A predefined choice for an MCP custom user variable. A bare string is used as
 * both the stored value and the displayed label; the object form allows a label
 * that differs from the technical value.
 */
export const MCPCustomUserVarValueSchema = z
  .union([
    z.string().min(1),
    z.object({
      value: z.string().min(1),
      label: z.string().min(1),
    }),
  ])
  /* Stored selections are canonicalized (trimmed), so a declared value carrying
   * surrounding whitespace could never be matched back. */
  .refine(
    (choice) => {
      const value = typeof choice === 'string' ? choice : choice.value;
      return value === value.trim();
    },
    { message: 'Predefined values must not have leading or trailing whitespace' },
  );

export type MCPCustomUserVarValue = z.infer<typeof MCPCustomUserVarValueSchema>;

export interface MCPCustomUserVarChoice {
  value: string;
  label: string;
}

/** Joins the selections of a `multiple` custom user variable into its stored form. */
export const mcpCustomUserVarSeparator = ',';

/** Splits a stored custom user variable back into its selected values. */
export function splitMCPCustomUserVarValue(value?: string | null): string[] {
  if (value == null || value.trim() === '') {
    return [];
  }
  return value
    .split(mcpCustomUserVarSeparator)
    .map((selection) => selection.trim())
    .filter((selection) => selection !== '');
}

/** Expands the shorthand string form of predefined values into value/label pairs. */
export function normalizeMCPCustomUserVarValues(
  values?: MCPCustomUserVarValue[] | null,
): MCPCustomUserVarChoice[] {
  if (values == null) {
    return [];
  }
  return values.map((choice) =>
    typeof choice === 'string' ? { value: choice, label: choice } : choice,
  );
}

/** Resolves the accepted values of a custom user variable, ignoring labels. */
export function getMCPCustomUserVarValues(values?: MCPCustomUserVarValue[] | null): string[] {
  return normalizeMCPCustomUserVarValues(values).map((choice) => choice.value);
}

/**
 * Canonical stored form of a submitted selection: trimmed, and re-joined without
 * padding when `multiple` is set. Validating one form and persisting another
 * would inject the untrimmed value into url/args/env placeholders.
 */
export function canonicalizeMCPCustomUserVarValue(value: string, multiple?: boolean): string {
  if (multiple !== true) {
    return value.trim();
  }
  return splitMCPCustomUserVarValue(value).join(mcpCustomUserVarSeparator);
}
