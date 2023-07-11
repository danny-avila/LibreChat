
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { createOpenAPIPlugin } = require('../dynamic/OpenAPIPlugin');

// The minimum Manifest definition
const ManifestDefinition = z.object({
  schema_version:z.string().optional(),
  name_for_human:z.string(),
  name_for_model:z.string(),
  description_for_human:z.string(),
  description_for_model:z.string(),
  auth: z.object({}).optional(),
  api: z.object({
    // Spec URL or can be the filename of the OpenAPI spec yaml file,
    // located in api\app\clients\tools\.well-known\openapi
    url:z.string(),
    type: z.string().optional(),
    is_user_authenticated: z.boolean().nullable().optional(),
    has_user_authentication: z.boolean().nullable().optional(),
  }),
  // use to override any params that the LLM will consistently get wrong
  params: z.object({}).optional(),
  logo_url:z.string().optional(),
  contact_email:z.string().optional(),
  legal_info_url:z.string().optional(),
});

function validateJson(json, verbose = true) {
  try {
    return ManifestDefinition.parse(json);
  } catch (error) {
    if (verbose) {
      console.debug('validateJson error', error);
    }
    return false;
  }
}

// omit the LLM to return the well known jsons as objects
async function loadSpecs({ llm, user, message, map = false, verbose = false }) {
  const directoryPath = path.join(__dirname, '..', '.well-known');
  const files = (await fs.promises.readdir(directoryPath)).filter((file) => path.extname(file) === '.json');

  const validJsons = [];
  const constructorMap = {};

  if (verbose) {
    console.debug('files', files);
  }

  for (const file of files) {
    if (path.extname(file) === '.json') {
      const filePath = path.join(directoryPath, file);
      const fileContent = await fs.promises.readFile(filePath, 'utf8');
      const json = JSON.parse(fileContent);

      if (!validateJson(json)) {
        verbose && console.debug('Invalid json', json);
        continue;
      }

      if (llm && map) {
        constructorMap[json.name_for_model] = async () => await createOpenAPIPlugin({
          data: json,
          llm,
          message,
          user,
          verbose
        });
        continue;
      }

      if (llm) {
        validJsons.push(createOpenAPIPlugin({ data: json, llm, verbose }));
        continue;
      }

      validJsons.push(json);
    }
  }

  if (map) {
    return constructorMap;
  }

  const plugins = (await Promise.all(validJsons)).filter((plugin) => plugin);

  // if (verbose) {
  //   console.debug('plugins', plugins);
  //   console.debug(plugins[0].name);
  // }

  return plugins;
}

module.exports = {
  loadSpecs,
  validateJson,
  ManifestDefinition,
};

// debugging
// loadSpecs({ llm: { hi: 'hello' }, map: true, verbose: true }).catch(console.error);