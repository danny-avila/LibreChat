const { CacheKeys } = require('librechat-data-provider');
const { loadDefaultModels, loadConfigModels, getCustomConfig } = require('~/server/services/Config');
const { getLogStores } = require('~/cache');
const { findUser } = require('~/models');

/**
 * @param {ServerRequest} req
 */
const getModelsConfig = async (req) => {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  let modelsConfig = await cache.get(CacheKeys.MODELS_CONFIG);
  if (!modelsConfig) {
    modelsConfig = await loadModels(req);
  }

  return modelsConfig;
};

/**
 * Loads the models from the config.
 * @param {ServerRequest} req - The Express request object.
 * @returns {Promise<TModelsConfig>} The models config.
 */
function arrayIntersectionExists(arr1, arr2) {
  console.log("comparing arrays:", arr1, arr2)
  return arr1.some(item => arr2.includes(item));
}


async function loadModels(req) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cachedModelsConfig = await cache.get(CacheKeys.MODELS_CONFIG);
  if (cachedModelsConfig) {
    return cachedModelsConfig;
  }
  const defaultModelsConfig = await loadDefaultModels(req);
  const customModelsConfig = await loadConfigModels(req);

  const user = await findUser({_id: req.user.id});
  console.log("🚀 ~ loadModels ~ req.user:", req.user.keycloakRoles.librechat)

  console.log(customModelsConfig)

  const customConfig = await getCustomConfig();

  if (!customConfig) {
    return {};//TODO: handle this
  }

  //console.log(customConfig)

  //we just care about azureOpenAI for now
  availableCustomModels = customModelsConfig['azureOpenAI']

  //first test with 1 group
  const ic_models_group = customConfig.endpoints.azureOpenAI.groups.filter((group) => {
    return group.group === 'ic_models'
  })[0]

  filteredAvailableCustomModels = {
    "azureOpenAI": []
  }
  for (let model in ic_models_group.models) {
    //console.log("🚀 ~ loadModels ~ ic_models_group.models[model].enabled_for:", ic_models_group.models[model].enabled_for)
    //iterating through clients available for the model
    ic_models_group.models[model].enabled_for.forEach((client) => {
      //if the user's role is in the available roles for the model
      console.log("🚀 ~ ic_models_group.models[model].enabled_for.forEach ~ user.keycloakRoles?.[client.client]?.['roles']:", user.keycloakRoles?.[client.client]?.['roles'])
      if (arrayIntersectionExists(client.roles, user.keycloakRoles?.[client.client]?.['roles'] ?? [])) {
        console.log("✅✅✅model found:", model)
        filteredAvailableCustomModels['azureOpenAI'].push(model)
      }
    })
  }


  const modelConfig = { ...defaultModelsConfig, ...filteredAvailableCustomModels };

  await cache.set(CacheKeys.MODELS_CONFIG, modelConfig);
  return modelConfig;
}

async function modelController(req, res) {
  const modelConfig = await loadModels(req);
  res.send(modelConfig);
}

module.exports = { modelController, loadModels, getModelsConfig };
