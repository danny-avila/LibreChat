const { zodToJsonSchema } = require('zod-to-json-schema');

const sanitizeSchemaMetadata = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizeSchemaMetadata);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((acc, key) => {
      if (key === '$schema') {
        return acc;
      }
      acc[key] = sanitizeSchemaMetadata(value[key]);
      return acc;
    }, {});
  }

  return value;
};

/**
 * Converts a Zod schema to JSON Schema and removes metadata that providers
 * like Google Gemini reject (e.g., the optional `$schema` field).
 *
 * @param {import('zod').ZodTypeAny} schema - Source schema definition.
 * @param {import('zod-to-json-schema').Options} [options] - Conversion options.
 * @returns {ReturnType<typeof zodToJsonSchema>} Assistant-safe JSON Schema.
 */
const buildAssistantJsonSchema = (schema, options) => {
  const jsonSchema = zodToJsonSchema(schema, options);
  return sanitizeSchemaMetadata(jsonSchema);
};

module.exports = {
  buildAssistantJsonSchema,
};
