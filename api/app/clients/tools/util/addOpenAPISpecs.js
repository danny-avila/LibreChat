const { loadSpecs } = require('./loadSpecs');

function transformSpec(input) {
  return {
    name: input.name_for_human,
    pluginKey: input.name_for_model,
    description: input.description_for_human,
    icon: input?.logo_url ?? 'https://placehold.co/70x70.png',
    // TODO: add support for authentication
    isAuthRequired: 'false',
    authConfig: [],
  };
}

async function addOpenAPISpecs(availableTools) {
  try {
    const specs = (await loadSpecs({})).map(transformSpec);
    if (specs.length > 0) {
      return [...specs, ...availableTools];
    }
    return availableTools;
  } catch (error) {
    return availableTools;
  }
}

module.exports = {
  transformSpec,
  addOpenAPISpecs,
};
