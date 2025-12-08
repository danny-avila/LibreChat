const modulePath = (() => {
  try {
    return require.resolve('zod-to-json-schema');
  } catch (error) {
    return null;
  }
})();

if (modulePath) {
  const cachedModule = require(modulePath);
  const originalFn =
    (typeof cachedModule === 'function' && cachedModule) ||
    cachedModule?.default ||
    cachedModule?.zodToJsonSchema;

  if (typeof originalFn === 'function' && !originalFn.__lcSchemaPatched) {
    originalFn.__lcSchemaPatched = true;
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

    const patchedFn = (...args) => {
      const schema = originalFn(...args);
      return stripSchemaFields(schema);
    };

    // Preserve existing function metadata
    const proto = Object.getPrototypeOf(originalFn);
    if (proto) {
      Object.setPrototypeOf(patchedFn, proto);
    }
    Object.assign(patchedFn, originalFn);
    patchedFn.__lcSchemaPatched = true;

    if (typeof cachedModule === 'function') {
      require.cache[modulePath].exports = patchedFn;
    } else if (cachedModule && typeof cachedModule === 'object') {
      cachedModule.default = patchedFn;
      cachedModule.zodToJsonSchema = patchedFn;
      require.cache[modulePath].exports = cachedModule;
    }
  }
}
