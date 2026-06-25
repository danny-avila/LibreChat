/**
 * Normalize a human-typed integer for a numeric input field.
 *
 * Strips thousands separators and any stray characters so values like
 * `"120,000"` (US) or `"120.000"` (EU) collapse to `"120000"` instead of being
 * silently truncated to `120` by a downstream `parseInt`. Every numeric model
 * parameter rendered as a text input is an integer token count, so this is
 * locale-agnostic: both `,` and `.` are treated as grouping separators.
 *
 * An empty result is preserved so the field can be cleared, which unsets the
 * value and falls back to the model/server default.
 */
export function sanitizeIntegerInput(value: string): string {
  return value.replace(/\D/g, '');
}
