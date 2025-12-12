import type { JsonSchemaType } from '~/types';

/**
 * Recursively removes metadata fields (like `$schema`) from JSON Schema objects.
 * This is necessary because some providers (e.g., Google Gemini) reject schemas
 * that contain these optional metadata fields.
 *
 * @param value - The value to sanitize (can be any JSON Schema value)
 * @returns The sanitized value with metadata fields removed
 */
export function sanitizeSchemaMetadata<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(sanitizeSchemaMetadata) as T;
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((acc, key) => {
      if (key === '$schema') {
        return acc;
      }
      (acc as Record<string, unknown>)[key] = sanitizeSchemaMetadata(
        (value as Record<string, unknown>)[key],
      );
      return acc;
    }, {} as T);
  }

  return value;
}

/**
 * Sanitizes a JSON Schema by removing provider-incompatible metadata fields.
 * Use this function when preparing tool schemas for API calls to providers
 * like Google Gemini that reject unknown schema properties.
 *
 * @param schema - The JSON Schema to sanitize
 * @returns The sanitized JSON Schema (same type as input)
 */
export function sanitizeToolSchema<T extends JsonSchemaType | undefined>(schema: T): T {
  if (schema == null) {
    return schema;
  }
  return sanitizeSchemaMetadata(schema) as T;
}
