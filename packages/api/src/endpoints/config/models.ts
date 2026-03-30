import { logger } from '@librechat/data-schemas';
import {
  ErrorTypes,
  EModelEndpoint,
  extractEnvVariable,
  normalizeEndpointName,
} from 'librechat-data-provider';
import type { TModelsConfig, TEndpoint } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { ServerRequest, GetUserKeyValuesFunction, UserKeyValues } from '~/types';
import type { FetchModelsParams } from '~/endpoints/models';
import { fetchModels as defaultFetchModels } from '~/endpoints/models';
import { isUserProvided } from '~/utils';

interface ResolvedEndpoint {
  name: string;
  endpoint: TEndpoint;
  apiKey: string;
  baseURL: string;
  apiKeyIsUserProvided: boolean;
  baseURLIsUserProvided: boolean;
}

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

    const resolved: ResolvedEndpoint[] = [];
    const userKeyEndpoints: ResolvedEndpoint[] = [];

    for (let i = 0; i < customEndpoints.length; i++) {
      const endpoint = customEndpoints[i];
      const { name: configName, baseURL, apiKey } = endpoint;
      const name = normalizeEndpointName(configName);
      endpointsMap[name] = endpoint;
      modelsConfig[name] = [];

      const resolvedApiKey = extractEnvVariable(apiKey);
      const resolvedBaseURL = extractEnvVariable(baseURL);
      const entry: ResolvedEndpoint = {
        name,
        endpoint,
        apiKey: resolvedApiKey,
        baseURL: resolvedBaseURL,
        apiKeyIsUserProvided: isUserProvided(resolvedApiKey),
        baseURLIsUserProvided: isUserProvided(resolvedBaseURL),
      };
      resolved.push(entry);

      if (
        endpoint.models?.fetch &&
        (entry.apiKeyIsUserProvided || entry.baseURLIsUserProvided) &&
        req.user?.id
      ) {
        userKeyEndpoints.push(entry);
      }
    }

    const userKeyMap = new Map<string, UserKeyValues | null>();
    if (userKeyEndpoints.length > 0 && req.user?.id) {
      const userId = req.user.id;
      const results = await Promise.allSettled(
        userKeyEndpoints.map((e) => getUserKeyValues({ userId, name: e.name })),
      );
      for (let i = 0; i < userKeyEndpoints.length; i++) {
        const settled = results[i];
        if (settled.status === 'fulfilled') {
          userKeyMap.set(userKeyEndpoints[i].name, settled.value);
        } else {
          const msg =
            settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
          const isKeyNotFound =
            msg.includes(ErrorTypes.NO_USER_KEY) || msg.includes(ErrorTypes.INVALID_USER_KEY);
          if (isKeyNotFound) {
            logger.debug(
              `[loadConfigModels] No user key stored for endpoint "${userKeyEndpoints[i].name}"`,
            );
          } else {
            logger.warn(
              `[loadConfigModels] Failed to retrieve user key for "${userKeyEndpoints[i].name}": ${msg}`,
            );
          }
          userKeyMap.set(userKeyEndpoints[i].name, null);
        }
      }
    }

    for (const {
      name,
      endpoint,
      apiKey: API_KEY,
      baseURL: BASE_URL,
      apiKeyIsUserProvided,
      baseURLIsUserProvided,
    } of resolved) {
      const { models, headers: endpointHeaders } = endpoint;
      const uniqueKey = `${BASE_URL}__${API_KEY}`;

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

      if (models?.fetch && userKeyMap.has(name)) {
        const userKeyValues = userKeyMap.get(name);
        const resolvedApiKey = apiKeyIsUserProvided ? userKeyValues?.apiKey : API_KEY;
        const resolvedBaseURL = baseURLIsUserProvided ? userKeyValues?.baseURL : BASE_URL;

        if (resolvedApiKey && resolvedBaseURL) {
          const userFetchKey = `user:${req.user?.id}:${name}`;
          fetchPromisesMap[userFetchKey] =
            fetchPromisesMap[userFetchKey] ||
            fetchModels({
              name,
              apiKey: resolvedApiKey,
              baseURL: resolvedBaseURL,
              user: req.user?.id,
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
      }

      if (Array.isArray(models?.default)) {
        modelsConfig[name] = models.default.map((model) =>
          typeof model === 'string' ? model : model.name,
        );
      }
    }

    const settledResults = await Promise.allSettled(Object.values(fetchPromisesMap));
    const uniqueKeys = Object.keys(fetchPromisesMap);

    for (let i = 0; i < settledResults.length; i++) {
      const currentKey = uniqueKeys[i];
      const settled = settledResults[i];
      if (settled.status === 'rejected') {
        logger.warn(`[loadConfigModels] Model fetch failed for "${currentKey}":`, settled.reason);
      }
      const modelData = settled.status === 'fulfilled' ? settled.value : [];
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
