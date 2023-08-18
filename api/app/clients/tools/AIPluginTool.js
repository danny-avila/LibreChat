const yaml = require('js-yaml');

function isJson(str) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

function convertJsonToYamlIfApplicable(spec) {
  if (spec.startsWith('{') && spec.endsWith('}')) {
    const jsonData = JSON.parse(spec);
    return yaml.dump(jsonData);
  }
  return spec;
}

function extractShortVersion(openapiSpec) {
  openapiSpec = convertJsonToYamlIfApplicable(openapiSpec);
  
  try {
    const fullApiSpec = yaml.load(openapiSpec);
    const shortApiSpec = {
      openapi: fullApiSpec.openapi,
      info: fullApiSpec.info,
      paths: {},
    };

    Object.entries(fullApiSpec.paths).forEach(([path, methods]) => {
      shortApiSpec.paths[path] = {};

      Object.entries(methods).forEach(([method, details]) => {
        shortApiSpec.paths[path][method] = {
          summary: details.summary,
          operationId: details.operationId,
          parameters: details.parameters?.map((parameter) => ({
            name: parameter.name,
            description: parameter.description,
          })),
        };
      });
    });

    return yaml.dump(shortApiSpec);
  } catch (e) {
    console.log(e);
    return '';
  }
}

function printOperationDetails(operationId, openapiSpec) {
  openapiSpec = convertJsonToYamlIfApplicable(openapiSpec);
  let returnText = '';

  try {
    const doc = yaml.load(openapiSpec);
    const { servers, paths, components } = doc;

    Object.entries(paths).forEach(([path, methods]) => {
      Object.entries(methods).forEach(([method, operation]) => {
        if (operation.operationId === operationId) {
          returnText += `The API request to do for operationId "${operationId}" is:\n`;
          returnText += `Method: ${method.toUpperCase()}\n`;

          const url = servers[0].url + path;
          returnText += `Path: ${url}\n`;

          returnText += 'Parameters:\n';
          if (operation.parameters) {
            operation.parameters.forEach((param) => {
              const required = param.required ? '' : ' (optional),';
              returnText += `- ${param.name} (${param.in},${required} ${param.schema.type}): ${param.description}\n`;
            });
          } else {
            returnText += ' None\n';
          }
          returnText += '\n';

          let responseSchema = operation.responses['200'].content['application/json'].schema;

          // Check if schema is a reference
          if (responseSchema.$ref) {
            // Extract schema name from reference
            const schemaName = responseSchema.$ref.split('/').pop();
            // Look up schema in components
            responseSchema = components.schemas[schemaName];
          }

          returnText += 'Response schema:\n';
          returnText += '- Type: ' + responseSchema.type + '\n';
          returnText += '- Additional properties:\n';
          returnText += '  - Type: ' + responseSchema.additionalProperties?.type + '\n';
          if (responseSchema.additionalProperties?.properties) {
            returnText += '  - Properties:\n';
            Object.keys(responseSchema.additionalProperties.properties).forEach((prop) => {
              returnText += `    - ${prop} (${responseSchema.additionalProperties.properties[prop].type}): Description not provided in OpenAPI spec\n`;
            });
          }
        }
      });
    });

    if (returnText === '') {
      returnText += `No operation with operationId "${operationId}" found.`;
    }

    return returnText;
  } catch (e) {
    console.log(e);
    return '';
  }
}

class AIPluginTool {
  _name;
  _description;
  apiSpec;
  openaiSpec;
  model;

  get name() {
    return this._name;
  }

  get description() {
    return this._description;
  }

  constructor(params) {
    this._name = params.name;
    this._description = params.description;
    this.apiSpec = params.apiSpec;
    this.openaiSpec = params.openaiSpec;
    this.model = params.model;
  }

  async _call(input) {
    const date = new Date();
    const fullDate = `Date: ${date.getDate()}/${
      date.getMonth() + 1
    }/${date.getFullYear()}, Time: ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
    const prompt = `${fullDate}\nQuestion: ${input} \n${this.apiSpec}.`;
    console.log(prompt);
    const gptResponse = await this.model.predict(prompt);
    const operationId = gptResponse.match(/operationId: (.*)/)?.[1];
    if (!operationId) {
      return 'No operationId found in the response';
    }
    if (operationId == 'No API path found to answer the question') {
      return 'No API path found to answer the question';
    }

    const openApiData = printOperationDetails(operationId, this.openaiSpec);

    return openApiData;
  }

  static async fromPluginUrl(url, model) {
    const aiPluginRes = await fetch(url, {});
    if (!aiPluginRes.ok) {
      throw new Error(`Failed to fetch plugin from ${url} with status ${aiPluginRes.status}`);
    }
    const aiPluginJson = await aiPluginRes.json();
    const apiUrlRes = await fetch(aiPluginJson.api.url, {});
    if (!apiUrlRes.ok) {
      throw new Error(
        `Failed to fetch API spec from ${aiPluginJson.api.url} with status ${apiUrlRes.status}`,
      );
    }
    const apiUrlJson = await apiUrlRes.text();
    const shortApiSpec = extractShortVersion(apiUrlJson);

    return new AIPluginTool({
      name: aiPluginJson.name_for_model.toLowerCase(),
      description: `A \`tool\` to learn the API documentation for ${aiPluginJson.name_for_model.toLowerCase()}, after which you can use 'http_request' to make the actual API call. Short description of how to use the API's results: ${
        aiPluginJson.description_for_model
      })`,
      apiSpec: `
As an AI, your task is to identify the operationId of the relevant API path based on the condensed OpenAPI specifications provided.

Please note:

1. Do not imagine URLs. Only use the information provided in the condensed OpenAPI specifications.

2. Do not guess the operationId. Identify it strictly based on the API paths and their descriptions.

Your output should only include:
- operationId: The operationId of the relevant API path

If you cannot find a suitable API path based on the OpenAPI specifications, please answer only "operationId: No API path found to answer the question".

Now, based on the question above and the condensed OpenAPI specifications given below, identify the operationId:

\`\`\`
${shortApiSpec}
\`\`\`
`,
      openaiSpec: apiUrlJson,
      model: model,
    });
  }
}

module.exports = AIPluginTool;
