const {
  SystemRoles,
  EModelEndpoint,
  defaultOrderQuery,
  defaultAssistantsVersion,
} = require('librechat-data-provider');
const { getAssistants } = require('~/models/Assistant');
const {
  initializeClient: initAzureClient,
} = require('~/server/services/Endpoints/azureAssistants');
const { initializeClient } = require('~/server/services/Endpoints/assistants');
const { getEndpointsConfig } = require('~/server/services/Config');

/**
 * @param {ServerRequest} req
 * @param {string} [endpoint]
 * @returns {Promise<string>}
 */
const getCurrentVersion = async (req, endpoint) => {
  const index = req.baseUrl.lastIndexOf('/v');
  let version = index !== -1 ? req.baseUrl.substring(index + 1, index + 3) : null;
  if (!version && req.body.version) {
    version = `v${req.body.version}`;
  }
  if (!version && endpoint) {
    const endpointsConfig = await getEndpointsConfig(req);
    version = `v${endpointsConfig?.[endpoint]?.version ?? defaultAssistantsVersion[endpoint]}`;
  }
  if (!version?.startsWith('v') && version.length !== 2) {
    throw new Error(`[${req.baseUrl}] Invalid version: ${version}`);
  }
  return version;
};

/**
 * Asynchronously lists assistants based on provided query parameters.
 *
 * Initializes the client with the current request and response objects and lists assistants
 * according to the query parameters. This function abstracts the logic for non-Azure paths.
 *
 * @deprecated
 * @async
 * @param {object} params - The parameters object.
 * @param {object} params.req - The request object, used for initializing the client.
 * @param {object} params.res - The response object, used for initializing the client.
 * @param {string} params.version - The API version to use.
 * @param {object} params.query - The query parameters to list assistants (e.g., limit, order).
 * @returns {Promise<object>} A promise that resolves to the response from the `openai.beta.assistants.list` method call.
 */
const _listAssistants = async ({ req, res, version, query }) => {
  const { openai } = await getOpenAIClient({ req, res, version });
  return openai.beta.assistants.list(query);
};

/**
 * Fetches all assistants based on provided query params, until `has_more` is `false`.
 *
 * @async
 * @param {object} params - The parameters object.
 * @param {object} params.req - The request object, used for initializing the client.
 * @param {object} params.res - The response object, used for initializing the client.
 * @param {string} params.version - The API version to use.
 * @param {Omit<AssistantListParams, 'endpoint'>} params.query - The query parameters to list assistants (e.g., limit, order).
 * @returns {Promise<Array<Assistant>>} A promise that resolves to the response from the `openai.beta.assistants.list` method call.
 */
const listAllAssistants = async ({ req, res, version, query }) => {
  /** @type {{ openai: OpenAI }} */
  const { openai } = await getOpenAIClient({ req, res, version });
  const allAssistants = [];

  let first_id;
  let last_id;
  let afterToken = query.after;
  let hasMore = true;

  while (hasMore) {
    const response = await openai.beta.assistants.list({
      ...query,
      after: afterToken,
    });

    const { body } = response;

    allAssistants.push(...body.data);
    hasMore = body.has_more;

    if (!first_id) {
      first_id = body.first_id;
    }

    if (hasMore) {
      afterToken = body.last_id;
    } else {
      last_id = body.last_id;
    }
  }

  // Enrich assistants with locally stored assistant documents (role, author, etc.)
  try {
    const assistantIds = allAssistants.map((a) => a.id).filter(Boolean);
    if (assistantIds.length) {
      const docs = await getAssistants({ assistant_id: { $in: assistantIds } });
      const docMap = docs.reduce((acc, d) => {
        if (d?.assistant_id) acc[d.assistant_id] = d;
        return acc;
      }, {});

      for (const assistant of allAssistants) {
        const doc = docMap[assistant.id];
        if (doc) {
          // merge role and any visibility fields from local doc into metadata if missing
          assistant.metadata = assistant.metadata || {};
          if (!assistant.metadata.role && doc.role) {
            assistant.metadata.role = doc.role;
          }
          if (!assistant.metadata.visibleTo && doc.visibleTo) {
            assistant.metadata.visibleTo = doc.visibleTo;
          }
          // normalize author to match metadata.author if missing
          if (!assistant.metadata.author && doc.user) {
            assistant.metadata.author = doc.user.toString?.() ?? doc.user;
          }
        }
      }
    }
  } catch (err) {
    // do not fail listing if enrichment fails
    // eslint-disable-next-line no-console
    console.debug('[listAllAssistants] enrichment failed', err?.message ?? err);
  }

  return {
    data: allAssistants,
    body: {
      data: allAssistants,
      has_more: false,
      first_id,
      last_id,
    },
  };
};

/**
 * Asynchronously lists assistants for Azure configured groups.
 *
 * Iterates through Azure configured assistant groups, initializes the client with the current request and response objects,
 * lists assistants based on the provided query parameters, and merges their data alongside the model information into a single array.
 *
 * @async
 * @param {object} params - The parameters object.
 * @param {object} params.req - The request object, used for initializing the client and manipulating the request body.
 * @param {object} params.res - The response object, used for initializing the client.
 * @param {string} params.version - The API version to use.
 * @param {TAzureConfig} params.azureConfig - The Azure configuration object containing assistantGroups and groupMap.
 * @param {object} params.query - The query parameters to list assistants (e.g., limit, order).
 * @returns {Promise<AssistantListResponse>} A promise that resolves to an array of assistant data merged with their respective model information.
 */
const listAssistantsForAzure = async ({ req, res, version, azureConfig = {}, query }) => {
  /** @type {Array<[string, TAzureModelConfig]>} */
  const groupModelTuples = [];
  const promises = [];
  /** @type {Array<TAzureGroup>} */
  const groups = [];

  const { groupMap, assistantGroups } = azureConfig;

  for (const groupName of assistantGroups) {
    const group = groupMap[groupName];
    groups.push(group);

    const currentModelTuples = Object.entries(group?.models);
    groupModelTuples.push(currentModelTuples);

    /* The specified model is only necessary to
    fetch assistants for the shared instance */
    req.body = req.body || {}; // Express 5: req.body is undefined instead of {} when no body parser runs
    req.body.model = currentModelTuples[0][0];
    promises.push(listAllAssistants({ req, res, version, query }));
  }

  const resolvedQueries = await Promise.all(promises);
  const data = resolvedQueries.flatMap((res, i) =>
    res.data.map((assistant) => {
      const deploymentName = assistant.model;
      const currentGroup = groups[i];
      const currentModelTuples = groupModelTuples[i];
      const firstModel = currentModelTuples[0][0];

      if (currentGroup.deploymentName === deploymentName) {
        return { ...assistant, model: firstModel };
      }

      for (const [model, modelConfig] of currentModelTuples) {
        if (modelConfig.deploymentName === deploymentName) {
          return { ...assistant, model };
        }
      }

      return { ...assistant, model: firstModel };
    }),
  );

  // Try to enrich assistants returned from Azure with locally stored assistant documents
  try {
    const assistantIds = data.map((a) => a.id).filter(Boolean);
    if (assistantIds.length) {
      const docs = await getAssistants({ assistant_id: { $in: assistantIds } });
      const docMap = docs.reduce((acc, d) => {
        if (d?.assistant_id) acc[d.assistant_id] = d;
        return acc;
      }, {});

      for (const assistant of data) {
        const doc = docMap[assistant.id];
        if (doc) {
          // merge role and any visibility fields from local doc into metadata if missing
          assistant.metadata = assistant.metadata || {};
          if (!assistant.metadata.role && doc.role) {
            assistant.metadata.role = doc.role;
          }
          if (!assistant.metadata.visibleTo && doc.visibleTo) {
            assistant.metadata.visibleTo = doc.visibleTo;
          }
          // normalize author to match metadata.author if missing
          if (!assistant.metadata.author && doc.user) {
            assistant.metadata.author = doc.user.toString?.() ?? doc.user;
          }
        }
      }
    }
  } catch (err) {
    // do not fail listing if enrichment fails
    // eslint-disable-next-line no-console
    console.debug('[listAssistantsForAzure] enrichment failed', err?.message ?? err);
  }

  return {
    first_id: data[0]?.id,
    last_id: data[data.length - 1]?.id,
    object: 'list',
    has_more: false,
    data,
  };
};

/**
 * Initializes the OpenAI client.
 * @param {object} params - The parameters object.
 * @param {ServerRequest} params.req - The request object.
 * @param {ServerResponse} params.res - The response object.
 * @param {TEndpointOption} params.endpointOption - The endpoint options.
 * @param {boolean} params.initAppClient - Whether to initialize the app client.
 * @param {string} params.overrideEndpoint - The endpoint to override.
 * @returns {Promise<{ openai: OpenAI, openAIApiKey: string }>} - The initialized OpenAI SDK client.
 */
async function getOpenAIClient({ req, res, endpointOption, initAppClient, overrideEndpoint }) {
  let endpoint = overrideEndpoint ?? req.body?.endpoint ?? req.query?.endpoint;
  const version = await getCurrentVersion(req, endpoint);
  if (!endpoint) {
    throw new Error(`[${req.baseUrl}] Endpoint is required`);
  }

  let result;
  if (endpoint === EModelEndpoint.assistants) {
    result = await initializeClient({ req, res, version, endpointOption, initAppClient });
  } else if (endpoint === EModelEndpoint.azureAssistants) {
    result = await initAzureClient({ req, res, version, endpointOption, initAppClient });
  }

  return result;
}

/**
 * Returns a list of assistants.
 * @param {object} params
 * @param {object} params.req - Express Request
 * @param {AssistantListParams} [params.req.query] - The assistant list parameters for pagination and sorting.
 * @param {object} params.res - Express Response
 * @param {string} [params.overrideEndpoint] - The endpoint to override the request endpoint.
 * @returns {Promise<AssistantListResponse>} 200 - success response - application/json
 */
const fetchAssistants = async ({ req, res, overrideEndpoint }) => {
  const appConfig = req.config;
  const {
    limit = 100,
    order = 'desc',
    after,
    before,
    endpoint,
  } = req.query ?? {
    endpoint: overrideEndpoint,
    ...defaultOrderQuery,
  };

  const version = await getCurrentVersion(req, endpoint);
  const query = { limit, order, after, before };

  /** @type {AssistantListResponse} */
  let body;

  if (endpoint === EModelEndpoint.assistants) {
    ({ body } = await listAllAssistants({ req, res, version, query }));
  } else if (endpoint === EModelEndpoint.azureAssistants) {
    const azureConfig = appConfig.endpoints?.[EModelEndpoint.azureOpenAI];
    body = await listAssistantsForAzure({ req, res, version, azureConfig, query });
  }

  if (req.user.role === SystemRoles.ADMIN) {
    return body;
  } else if (!appConfig.endpoints?.[endpoint]) {
    return body;
  }

  body.data = filterAssistants({
    userId: req.user.id,
    assistants: body.data,
    assistantsConfig: appConfig.endpoints?.[endpoint],
  });
  return body;
};

/**
 * Filter assistants based on configuration.
 *
 * @param {object} params - The parameters object.
 * @param {string} params.userId -  The user ID to filter private assistants.
 * @param {Assistant[]} params.assistants - The list of assistants to filter.
 * @param {Partial<TAssistantEndpoint>} params.assistantsConfig -  The assistant configuration.
 * @returns {Assistant[]} - The filtered list of assistants.
 */
// function filterAssistants({ assistants, userId, assistantsConfig }) {
//   const { supportedIds, excludedIds } = assistantsConfig;

//   if (supportedIds?.length) {
//     return assistants.filter((assistant) => supportedIds.includes(assistant.id));
//   } else if (excludedIds?.length) {
//     return assistants.filter((assistant) => !excludedIds.includes(assistant.id));
//   }

//   return assistants;
// }

function filterAssistants({ assistants, userId, assistantsConfig }) {
  const { supportedIds, excludedIds } = assistantsConfig;
  
  // 过滤助手：
  // 1. 用户自己创建的助手总是可见
  // 2. 其他用户创建的助手：
  //    - 如果设置了 visibleTo，检查当前用户是否在列表中
  //    - 如果没有设置 visibleTo，则默认对所有用户可见（管理员创建的助手）
  const filteredAssistants = assistants.filter((assistant) => {
    const authorId = assistant.metadata?.author;
    
    // 用户自己创建的助手总是可见
    if (userId === authorId) {
      return true;
    }
    
    // 其他用户创建的助手
    if (authorId && authorId !== userId) {
      // 如果设置了 visibleTo 字段，检查当前用户是否在列表中
      if (assistant.metadata.visibleTo) {
        // visibleTo 应该是一个用户ID数组
        return Array.isArray(assistant.metadata.visibleTo) && 
               assistant.metadata.visibleTo.includes(userId);
      }
      
      // 没有 visibleTo 时，只有当作者角色是管理员才对所有用户可见
      const role = assistant.metadata?.role;
      return typeof role === 'string' && role.toUpperCase() === SystemRoles.ADMIN;
    }
    
    // 没有作者信息的助手默认不可见
    return false;
  });
  
  // 应用 supportedIds 和 excludedIds 过滤
  if (supportedIds?.length) {
    return filteredAssistants.filter((assistant) => supportedIds.includes(assistant.id));
  } else if (excludedIds?.length) {
    return filteredAssistants.filter((assistant) => !excludedIds.includes(assistant.id));
  }
  
  return filteredAssistants;
}

module.exports = {
  getOpenAIClient,
  fetchAssistants,
  getCurrentVersion,
};
