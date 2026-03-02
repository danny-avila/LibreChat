const { sanitizeSchemaMetadata } = require('@librechat/api');

/**
 * This module patches JSON schema generation to remove '$schema' metadata fields
 * that cause errors with Google's OpenAI-compatible API when using Gemini models
 * with MCP tools like Tavily.
 *
 * The issue: Google's OpenAI-compatible API rejects tool parameters containing
 * '$schema' fields, returning:
 * "Invalid JSON payload received. Unknown name '$schema' at 'tools[0].function_declarations[0].parameters'"
 *
 * Solution: Patch both zod-to-json-schema and @langchain/core's toJsonSchema
 * to sanitize output and remove $schema fields.
 */

// Patch zod-to-json-schema (best-effort)
const zodModulePath = (() => {
  try {
    return require.resolve('zod-to-json-schema');
  } catch (_error) {
    return null;
  }
})();

if (zodModulePath) {
  const cachedModule = require(zodModulePath);
  const originalFn =
    (typeof cachedModule === 'function' && cachedModule) ||
    cachedModule?.default ||
    cachedModule?.zodToJsonSchema;

  if (typeof originalFn === 'function' && !originalFn.__lcSanitized) {
    const patchedFn = (...args) => {
      const schema = originalFn(...args);
      return sanitizeSchemaMetadata(schema);
    };

    patchedFn.__lcSanitized = true;

    if (typeof cachedModule === 'function') {
      require.cache[zodModulePath].exports = patchedFn;
    } else if (cachedModule && typeof cachedModule === 'object') {
      cachedModule.default = patchedFn;
      cachedModule.zodToJsonSchema = patchedFn;
      require.cache[zodModulePath].exports = cachedModule;
    }
  }
}

// Patch @langchain/core's toJsonSchema directly. This is critical because
// LangChain caches zod-to-json-schema reference at module load time.
const langchainModulePath = (() => {
  try {
    const path = require('path');
    const corePkgPath = require.resolve('@langchain/core/package.json');
    const coreDir = path.dirname(corePkgPath);
    return path.join(coreDir, 'dist/utils/json_schema.cjs');
  } catch (_error) {
    return null;
  }
})();

if (langchainModulePath) {
  const lcModule = require(langchainModulePath);
  const origToJsonSchema = lcModule.toJsonSchema;

  if (typeof origToJsonSchema === 'function' && !origToJsonSchema.__lcSanitized) {
    const patchedToJsonSchema = function patchedToJsonSchema(schema) {
      const result = origToJsonSchema(schema);
      return sanitizeSchemaMetadata(result);
    };

    patchedToJsonSchema.__lcSanitized = true;
    lcModule.toJsonSchema = patchedToJsonSchema;
    if (require.cache[langchainModulePath]) {
      require.cache[langchainModulePath].exports.toJsonSchema = patchedToJsonSchema;
    }
  }
}

module.exports = { sanitizeSchemaMetadata };
