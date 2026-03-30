import { logger } from '@librechat/data-schemas';
import { EModelEndpoint, extractEnvVariable, normalizeEndpointName } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { TModelsConfig, TEndpoint } from 'librechat-data-provider';
import type { ServerRequest, GetUserKeyValuesFunction } from '~/types';
import type { FetchModelsParams } from '~/endpoints/models';
import { isUserProvided } from '~/utils';
import { fetchModels as defaultFetchModels } from '~/endpoints/models';

export interface LoadConfigModelsDeps {
  getAppConfig: (params: { role?: string | null; tenantId?: string }) => Promise<AppConfig>;
  getUserKeyValues: GetUserKeyValuesFunction;
  fetchModels?: (params: FetchModelsParams) => Promise<string[]>;
}

export function createLoadConfigModels(deps: LoadConfigModelsDeps) {
  const { getAppConfig, getUserKeyValues, fetchModels = defaultFetchModels } = deps;

  return async function loadConfigModels(req: ServerRequest): Promise<TModelsConfig> {
    const appConfig = await getAppConfig({
      role: req.user?.role,
      tenantId: req.user?.tenantId,
    });
    if (!appConfig) {
      return {};
    }

    const modelsConfig: TModelsConfig = {};
    const azureConfig = appConfig.endpoints?.[EModelEndpoint.azureOpenAI];
    const { modelNames } = azureConfig ?? {};

    if (modelNames && azureConfig) {
      modelsConfig[EModelEndpoint.azureOpenAI] = modelNames;
    }

    if (azureConfig?.assistants && azureConfig.assistantModels) {
      modelsConfig[EModelEndpoint.azureAssistants] = azureConfig.assistantModels;
    }

    const bedrockConfig = appConfig.endpoints?.[EModelEndpoint.bedrock];
    if (bedrockConfig?.models && Array.isArray(bedrockConfig.models)) {
      modelsConfig[EModelEndpoint.bedrock] = bedrockConfig.models;
    }

    if (!Array.isArray(appConfig.endpoints?.[EModelEndpoint.custom])) {
      return modelsConfig;
    }

    const customEndpoints = (appConfig.endpoints[EModelEndpoint.custom] as TEndpoint[]).filter(
      (endpoint) =>
        endpoint.baseURL &&
        endpoint.apiKey &&
        endpoint.name &&
        endpoint.models &&
        (endpoint.models.fetch || endpoint.models.default),
    );

    const fetchPromisesMap: Record<string, Promise<string[]>> = {};
    const uniqueKeyToEndpointsMap: Record<string, string[]> = {};
    const endpointsMap: Record<string, TEndpoint> = {};

    for (let i = 0; i < customEndpoints.length; i++) {
      const endpoint = customEndpoints[i];
      const { models, name: configName, baseURL, apiKey, headers: endpointHeaders } = endpoint;
      const name = normalizeEndpointName(configName);
      endpointsMap[name] = endpoint;

      const API_KEY = extractEnvVariable(apiKey);
      const BASE_URL = extractEnvVariable(baseURL);
      const uniqueKey = `${BASE_URL}__${API_KEY}`;

      modelsConfig[name] = [];

      const apiKeyIsUserProvided = isUserProvided(API_KEY);
      const baseURLIsUserProvided = isUserProvided(BASE_URL);

      if (models?.fetch && !apiKeyIsUserProvided && !baseURLIsUserProvided) {
        fetchPromisesMap[uniqueKey] =
          fetchPromisesMap[uniqueKey] ||
          fetchModels({
            name,
            apiKey: API_KEY,
            baseURL: BASE_URL,
            user: req.user?.id,
            userObject: req.user,
            headers: endpointHeaders,
            direct: endpoint.directEndpoint,
            userIdQuery: models.userIdQuery,
          });
        uniqueKeyToEndpointsMap[uniqueKey] = uniqueKeyToEndpointsMap[uniqueKey] || [];
        uniqueKeyToEndpointsMap[uniqueKey].push(name);
        continue;
      }

      if (models?.fetch && (apiKeyIsUserProvided || baseURLIsUserProvided) && req.user?.id) {
        try {
          const userKeyValues = await getUserKeyValues({ userId: req.user.id, name });
          const resolvedApiKey = apiKeyIsUserProvided ? userKeyValues?.apiKey : API_KEY;
          const resolvedBaseURL = baseURLIsUserProvided ? userKeyValues?.baseURL : BASE_URL;

          if (resolvedApiKey && resolvedBaseURL) {
            const userFetchKey = `user:${req.user.id}:${name}`;
            fetchPromisesMap[userFetchKey] =
              fetchPromisesMap[userFetchKey] ||
              fetchModels({
                name,
                apiKey: resolvedApiKey,
                baseURL: resolvedBaseURL,
                user: req.user.id,
                userObject: req.user,
                headers: endpointHeaders,
                direct: endpoint.directEndpoint,
                userIdQuery: models.userIdQuery,
                skipCache: true,
              });
            uniqueKeyToEndpointsMap[userFetchKey] = uniqueKeyToEndpointsMap[userFetchKey] || [];
            uniqueKeyToEndpointsMap[userFetchKey].push(name);
            continue;
          }
        } catch {
          logger.debug(`[loadConfigModels] No user key found for endpoint "${name}"`);
        }
      }

      if (Array.isArray(models?.default)) {
        modelsConfig[name] = models.default.map((model) =>
          typeof model === 'string' ? model : model.name,
        );
      }
    }

    const fetchedData = await Promise.all(Object.values(fetchPromisesMap));
    const uniqueKeys = Object.keys(fetchPromisesMap);

    for (let i = 0; i < fetchedData.length; i++) {
      const currentKey = uniqueKeys[i];
      const modelData = fetchedData[i];
      const associatedNames = uniqueKeyToEndpointsMap[currentKey];

      for (const name of associatedNames) {
        const endpoint = endpointsMap[name];
        const defaults = (endpoint.models?.default ?? []).map((m) =>
          typeof m === 'string' ? m : m.name,
        );
        modelsConfig[name] = !modelData?.length ? defaults : modelData;
      }
    }

    return modelsConfig;
  };
}
