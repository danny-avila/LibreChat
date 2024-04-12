const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { logger } = require('~/config');
const { createOpenAPIPlugin } = require('~/app/clients/tools/dynamic/OpenAPIPlugin');

// The minimum Manifest definition
const ManifestDefinition = z.object({
  schema_version: z.string().optional(),
  name_for_human: z.string(),
  name_for_model: z.string(),
  description_for_human: z.string(),
  description_for_model: z.string(),
  auth: z.object({}).optional(),
  api: z.object({
    // Spec URL or can be the filename of the OpenAPI spec yaml file,
    // located in api\app\clients\tools\.well-known\openapi
    url: z.string(),
    type: z.string().optional(),
    is_user_authenticated: z.boolean().nullable().optional(),
    has_user_authentication: z.boolean().nullable().optional(),
  }),
  // use to override any params that the LLM will consistently get wrong
  params: z.object({}).optional(),
  logo_url: z.string().optional(),
  contact_email: z.string().optional(),
  legal_info_url: z.string().optional(),
});

function validateJson(json) {
  try {
    return ManifestDefinition.parse(json);
  } catch (error) {
    logger.debug('[validateJson] manifest parsing error', error);
    return false;
  }
}

// omit the LLM to return the well known jsons as objects
async function loadSpecs({ llm, user, message, tools = [], map = false, memory, signal }) {
  const directoryPath = path.join(__dirname, '..', '.well-known');
  let files = [];

  for (let i = 0; i < tools.length; i++) {
    const filePath = path.join(directoryPath, tools[i] + '.json');

    try {
      // If the access Promise is resolved, it means that the file exists
      // Then we can add it to the files array
      await fs.promises.access(filePath, fs.constants.F_OK);
      files.push(tools[i] + '.json');
    } catch (err) {
      logger.error(`[loadSpecs] File ${tools[i] + '.json'} does not exist`, err);
    }
  }

  if (files.length === 0) {
    files = (await fs.promises.readdir(directoryPath)).filter(
      (file) => path.extname(file) === '.json',
    );
  }

  const validJsons = [];
  const constructorMap = {};

  logger.debug('[validateJson] files', files);

  for (const file of files) {
    if (path.extname(file) === '.json') {
      const filePath = path.join(directoryPath, file);
      const fileContent = await fs.promises.readFile(filePath, 'utf8');
      const json = JSON.parse(fileContent);

      if (!validateJson(json)) {
        logger.debug('[validateJson] Invalid json', json);
        continue;
      }

      if (llm && map) {
        constructorMap[json.name_for_model] = async () =>
          await createOpenAPIPlugin({
            data: json,
            llm,
            message,
            memory,
            signal,
            user,
          });
        continue;
      }

      if (llm) {
        validJsons.push(createOpenAPIPlugin({ data: json, llm }));
        continue;
      }

      validJsons.push(json);
    }
  }

  if (map) {
    return constructorMap;
  }

  const plugins = (await Promise.all(validJsons)).filter((plugin) => plugin);

  //   logger.debug('[validateJson] plugins', plugins);
  //   logger.debug(plugins[0].name);

  return plugins;
}

module.exports = {
  loadSpecs,
  validateJson,
  ManifestDefinition,
};
