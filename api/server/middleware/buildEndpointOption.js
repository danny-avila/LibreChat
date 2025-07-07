const { logger } = require('@librechat/data-schemas');
const { handleError } = require('@librechat/api');
const {
  EndpointURLs,
  EModelEndpoint,
  isAgentsEndpoint,
  parseCompactConvo,
} = require('librechat-data-provider');
const azureAssistants = require('~/server/services/Endpoints/azureAssistants');
const assistants = require('~/server/services/Endpoints/assistants');
const { processFiles } = require('~/server/services/Files/process');
const anthropic = require('~/server/services/Endpoints/anthropic');
const bedrock = require('~/server/services/Endpoints/bedrock');
const openAI = require('~/server/services/Endpoints/openAI');
const agents = require('~/server/services/Endpoints/agents');
const custom = require('~/server/services/Endpoints/custom');
const google = require('~/server/services/Endpoints/google');
const { getFiles } = require('~/models/File');

const buildFunction = {
  [EModelEndpoint.openAI]: openAI.buildOptions,
  [EModelEndpoint.google]: google.buildOptions,
  [EModelEndpoint.custom]: custom.buildOptions,
  [EModelEndpoint.agents]: agents.buildOptions,
  [EModelEndpoint.bedrock]: bedrock.buildOptions,
  [EModelEndpoint.azureOpenAI]: openAI.buildOptions,
  [EModelEndpoint.anthropic]: anthropic.buildOptions,
  [EModelEndpoint.assistants]: assistants.buildOptions,
  [EModelEndpoint.azureAssistants]: azureAssistants.buildOptions,
};

async function buildEndpointOption(req, res, next) {
  const { endpoint, endpointType } = req.body;
  let parsedBody;
  try {
    parsedBody = parseCompactConvo({ endpoint, endpointType, conversation: req.body });
  } catch (error) {
    logger.warn(
      `Error parsing conversation for endpoint ${endpoint}${error?.message ? `: ${error.message}` : ''}`,
    );
    return handleError(res, { text: 'Error parsing conversation' });
  }

  if (req.app.locals.modelSpecs?.list && req.app.locals.modelSpecs?.enforce) {
    /** @type {{ list: TModelSpec[] }}*/
    const { list } = req.app.locals.modelSpecs;
    const { spec } = parsedBody;

    if (!spec) {
      return handleError(res, { text: 'No model spec selected' });
    }

    const currentModelSpec = list.find((s) => s.name === spec);
    if (!currentModelSpec) {
      return handleError(res, { text: 'Invalid model spec' });
    }

    if (endpoint !== currentModelSpec.preset.endpoint) {
      return handleError(res, { text: 'Model spec mismatch' });
    }

    try {
      currentModelSpec.preset.spec = spec;
      if (currentModelSpec.iconURL != null && currentModelSpec.iconURL !== '') {
        currentModelSpec.preset.iconURL = currentModelSpec.iconURL;
      }
      parsedBody = parseCompactConvo({
        endpoint,
        endpointType,
        conversation: currentModelSpec.preset,
      });
    } catch (error) {
      logger.error(`Error parsing model spec for endpoint ${endpoint}`, error);
      return handleError(res, { text: 'Error parsing model spec' });
    }
  }

  try {
    const isAgents =
      isAgentsEndpoint(endpoint) || req.baseUrl.startsWith(EndpointURLs[EModelEndpoint.agents]);
    const builder = isAgents
      ? (...args) => buildFunction[EModelEndpoint.agents](req, ...args)
      : buildFunction[endpointType ?? endpoint];

    // TODO: use object params
    req.body.endpointOption = await builder(endpoint, parsedBody, endpointType);

    // Process files for all endpoints
    if (req.body.files) {
      if (isAgents) {
        // For agents endpoints, retrieve full file objects from database if files are just file_ids
        try {
          const files = req.body.files;
          // Check if files are just file_ids (strings) or already full file objects
          const needsRetrieval = files.some(file =>
            typeof file === 'string' || (typeof file === 'object' && file.file_id && !file.filename)
          );

          if (needsRetrieval) {
            if (process.env.TEMP_DOWNLOAD_DEBUG === 'true') {
              console.log('[buildEndpointOption] Retrieving full file objects for agents endpoint:', {
                fileCount: files.length,
                files: files.map(f => typeof f === 'string' ? f : f.file_id)
              });
            }

            const file_ids = files.map(file => typeof file === 'string' ? file : file.file_id);
            const fullFiles = await getFiles({ file_id: { $in: file_ids }, user: req.user.id });

            if (process.env.TEMP_DOWNLOAD_DETAILED_LOGGING === 'true') {
              console.log('[buildEndpointOption] Retrieved files:', {
                requestedCount: file_ids.length,
                retrievedCount: fullFiles.length,
                retrievedFiles: fullFiles.map(f => ({ file_id: f.file_id, filename: f.filename }))
              });
            }

            // Replace req.body.files with full file objects
            req.body.files = fullFiles;
          }
        } catch (error) {
          logger.error('[buildEndpointOption] Error retrieving files for agents endpoint:', error);
          // Continue with original files if retrieval fails
        }
      } else {
        // For non-agents endpoints, use the existing processFiles function
        req.body.endpointOption.attachments = processFiles(req.body.files);
      }
    }

    next();
  } catch (error) {
    logger.error(
      `Error building endpoint option for endpoint ${endpoint} with type ${endpointType}`,
      error,
    );
    return handleError(res, { text: 'Error building endpoint option' });
  }
}

module.exports = buildEndpointOption;
