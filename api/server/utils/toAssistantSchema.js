const { zodToJsonSchema } = require('zod-to-json-schema');

const stripSchemaFields = (value) => {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      stripSchemaFields(item);
    }
    return value;
  }

  if (Object.prototype.hasOwnProperty.call(value, '$schema')) {
    delete value.$schema;
  }

  for (const key of Object.keys(value)) {
    stripSchemaFields(value[key]);
  }

  return value;
};

const toAssistantJsonSchema = (schema, options) => {
  const jsonSchema = zodToJsonSchema(schema, options);
  return stripSchemaFields(jsonSchema);
};

module.exports = {
  toAssistantJsonSchema,
};
