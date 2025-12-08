const { sanitizeSchemaMetadata } = require('./toAssistantSchema');

const modulePath = (() => {
  try {
    return require.resolve('zod-to-json-schema');
  } catch (_error) {
    return null;
  }
})();

if (modulePath) {
  const cachedModule = require(modulePath);
  const originalFn =
    (typeof cachedModule === 'function' && cachedModule) ||
    cachedModule?.default ||
    cachedModule?.zodToJsonSchema;

  if (typeof originalFn !== 'function' || originalFn.__lcSanitized) {
    module.exports = originalFn;
  } else {
    const patchedFn = (...args) => {
      const schema = originalFn(...args);
      return sanitizeSchemaMetadata(schema);
    };

    patchedFn.__lcSanitized = true;

    if (typeof cachedModule === 'function') {
      require.cache[modulePath].exports = patchedFn;
    } else if (cachedModule && typeof cachedModule === 'object') {
      cachedModule.default = patchedFn;
      cachedModule.zodToJsonSchema = patchedFn;
      require.cache[modulePath].exports = cachedModule;
    }

    module.exports = patchedFn;
  }
} else {
  module.exports = null;
}
