const { EModelEndpoint } = require('librechat-data-provider');
const { normalizeEndpointName } = require('~/server/utils');
const { logger } = require('~/config');

/**
 * Sets up Model Specs from the config (`librechat.yaml`) file.
 * @param {TCustomConfig['endpoints']} [endpoints] - The loaded custom configuration for endpoints.
 * @param {TCustomConfig['modelSpecs'] | undefined} [modelSpecs] - The loaded custom configuration for model specs.
 * @returns {TCustomConfig['modelSpecs'] | undefined} The processed model specs, if any.
 */
function processModelSpecs(endpoints, _modelSpecs) {
  if (!_modelSpecs) {
    return undefined;
  }

  /** @type {TCustomConfig['modelSpecs']['list']} */
  const modelSpecs = [];
  /** @type {TCustomConfig['modelSpecs']['list']} */
  const list = _modelSpecs.list;

  const customEndpoints = endpoints?.[EModelEndpoint.custom] ?? [];

  for (const spec of list) {
    if (EModelEndpoint[spec.preset.endpoint] && spec.preset.endpoint !== EModelEndpoint.custom) {
      modelSpecs.push(spec);
      continue;
    } else if (spec.preset.endpoint === EModelEndpoint.custom) {
      logger.warn(
        `Model Spec with endpoint "${spec.preset.endpoint}" is not supported. You must specify the name of the custom endpoint (case-sensitive, as defined in your config). Skipping model spec...`,
      );
      continue;
    }

    const normalizedName = normalizeEndpointName(spec.preset.endpoint);
    const endpoint = customEndpoints.find(
      (customEndpoint) => normalizedName === normalizeEndpointName(customEndpoint.name),
    );

    if (!endpoint) {
      logger.warn(`Model spec with endpoint "${spec.preset.endpoint}" was skipped: Endpoint not found in configuration. The \`endpoint\` value must exactly match either a system-defined endpoint or a custom endpoint defined by the user.

For more information, see the documentation at https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/model_specs#endpoint`);
      continue;
    }

    modelSpecs.push({
      ...spec,
      preset: {
        ...spec.preset,
        endpoint: normalizedName,
      },
    });
  }

  return {
    ..._modelSpecs,
    list: modelSpecs,
  };
}

module.exports = { processModelSpecs };
