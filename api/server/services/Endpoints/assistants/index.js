const addTitle = require('./addTitle');
const buildOptions = require('./buildOptions');
const initializeClient = require('./initializeClient');

/**
 * Asynchronously lists assistants based on provided query parameters.
 *
 * Initializes the client with the current request and response objects and lists assistants
 * according to the query parameters. This function abstracts the logic for non-Azure paths.
 *
 * @async
 * @param {object} params - The parameters object.
 * @param {object} params.req - The request object, used for initializing the client.
 * @param {object} params.res - The response object, used for initializing the client.
 * @param {object} params.query - The query parameters to list assistants (e.g., limit, order).
 * @returns {Promise<object>} A promise that resolves to the response from the `openai.beta.assistants.list` method call.
 */
const listAssistants = async ({ req, res, query }) => {
  const { openai } = await initializeClient({ req, res });
  return openai.beta.assistants.list(query);
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
 * @param {TAzureConfig} params.azureConfig - The Azure configuration object containing assistantGroups and groupMap.
 * @param {object} params.query - The query parameters to list assistants (e.g., limit, order).
 * @returns {Promise<AssistantListResponse>} A promise that resolves to an array of assistant data merged with their respective model information.
 */
const listAssistantsForAzure = async ({ req, res, azureConfig = {}, query }) => {
  const promises = [];
  const models = [];

  const { groupMap, assistantGroups } = azureConfig;

  for (const groupName of assistantGroups) {
    const group = groupMap[groupName];
    req.body.model = Object.keys(group?.models)[0];
    models.push(req.body.model);
    promises.push(listAssistants({ req, res, query }));
  }

  const resolvedQueries = await Promise.all(promises);
  const data = resolvedQueries.flatMap((res, i) =>
    res.data.map((assistant) => {
      const model = models[i];
      return { ...assistant, model } ?? {};
    }),
  );

  return {
    first_id: data[0]?.id,
    last_id: data[data.length - 1]?.id,
    object: 'list',
    has_more: false,
    data,
  };
};

module.exports = {
  addTitle,
  buildOptions,
  initializeClient,
  listAssistants,
  listAssistantsForAzure,
};
