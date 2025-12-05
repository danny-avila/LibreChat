/**
 * Merge the original config with the overrides, recursively.
 *
 * Features:
 * - Deep recursive merge of objects
 * - $replace: true directive for complete section replacement
 * - Empty object handling
 *
 * This function is extracted from createTempLibrechatConfigLite.js and is used
 * to merge configuration overrides (like custom-models.yml and test overrides)
 * into the base librechat.yaml configuration.
 *
 * If the override is an empty object, replace the original value with the override.
 *
 * @param {Object} fullConfig - Base configuration object
 * @param {Object} overrides - Override configuration object
 * @returns {Object} - Merged configuration
 */
function mergeLibrechatConfig(fullConfig, overrides) {
  if (overrides == null || fullConfig == null) {
    return fullConfig;
  }

  function isPlainObject(value) {
    return typeof value === 'object' && !Array.isArray(value) && value != null;
  }

  function getNewValue(configValue, overrideValue) {
    if (isPlainObject(overrideValue) && isPlainObject(configValue)) {
      // Check if override is explicitly an empty object - if so, replace entirely
      if (Object.keys(overrideValue).length === 0) {
        return overrideValue; // Replace with empty object, useful for disabling entire sections
      }

      // Check for $replace directive
      if (overrideValue.$replace === true) {
        // Remove $replace key and return the rest as replacement
        const { $replace: _, ...replacement } = overrideValue;
        return replacement;
      }

      // both are objects, merge recursively
      return mergeLibrechatConfig(configValue, overrideValue);
    }

    return overrideValue;
  }

  // traverse the overrides, merging with the full config
  for (const key in overrides) {
    fullConfig[key] = getNewValue(fullConfig[key], overrides[key]);
  }

  return fullConfig;
}

module.exports = { mergeLibrechatConfig };
