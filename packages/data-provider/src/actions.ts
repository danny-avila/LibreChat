import axios from 'axios';
import crypto from 'crypto';
import { load } from 'js-yaml';
import type { OpenAPIV3 } from 'openapi-types';

export type Schema = OpenAPIV3.SchemaObject & { description?: string };
export type Reference = OpenAPIV3.ReferenceObject & { description?: string };
export type ParametersSchema = {
  type: string;
  properties: Record<string, Reference | Schema>;
  required: string[];
};

export type BasicCredentials = {
  username: string;
  password: string;
};

export type BearerCredentials = {
  token: string;
};

export type ApiKeyCredentials = {
  headerName: string;
  apiKey: string;
};

export type OAuthCredentials = {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
};

export type Credentials =
  | BasicCredentials
  | BearerCredentials
  | ApiKeyCredentials
  | OAuthCredentials;

export function sha1(input: string) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

export class FunctionSignature {
  name: string;
  description: string;
  parameters: object;

  constructor(name: string, description: string, parameters: object) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
  }

  toObjectTool() {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

export class ActionRequest {
  domain: string;
  path: string;
  method: string;
  operation: string;
  operationHash?: string;
  isConsequential: boolean;
  contentType: string;
  params?: object;

  constructor(
    domain: string,
    path: string,
    method: string,
    operation: string,
    isConsequential: boolean,
    contentType: string,
  ) {
    this.domain = domain;
    this.path = path;
    this.method = method;
    this.operation = operation;
    this.isConsequential = isConsequential;
    this.contentType = contentType;
  }

  private authHeaders: Record<string, string> = {};
  private authToken?: string;

  async setParams(params: object) {
    this.operationHash = sha1(JSON.stringify(params));
    this.params = params;
  }

  async setAuth(type: 'Basic' | 'Bearer' | 'ApiKey' | 'OAuth', credentials: Credentials) {
    if (type === 'Basic' && 'username' in credentials && 'password' in credentials) {
      const basicToken = Buffer.from(`${credentials.username}:${credentials.password}`).toString(
        'base64',
      );
      this.authHeaders['Authorization'] = `Basic ${basicToken}`;
    } else if (type === 'Bearer' && 'token' in credentials) {
      this.authHeaders['Authorization'] = `Bearer ${credentials.token}`;
    } else if (type === 'ApiKey' && 'headerName' in credentials && 'apiKey' in credentials) {
      this.authHeaders[credentials.headerName] = credentials.apiKey;
    } else if (
      type === 'OAuth' &&
      'tokenUrl' in credentials &&
      'clientId' in credentials &&
      'clientSecret' in credentials &&
      'scope' in credentials
    ) {
      if (!this.authToken) {
        const tokenResponse = await axios.post(
          credentials.tokenUrl,
          {
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            scope: credentials.scope,
            grant_type: 'client_credentials',
          },
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        );
        this.authToken = tokenResponse.data.access_token;
      }
      this.authHeaders['Authorization'] = `Bearer ${this.authToken}`;
    }
  }

  async execute() {
    const url = `${this.domain}${this.path}`;
    const headers = {
      ...this.authHeaders,
      'Content-Type': this.contentType,
    };

    const method = this.method.toLowerCase();

    if (method === 'get') {
      return axios.get(url, { headers, params: this.params });
    } else if (method === 'post') {
      return axios.post(url, this.params, { headers });
    } else if (method === 'put') {
      return axios.put(url, this.params, { headers });
    } else if (method === 'delete') {
      return axios.delete(url, { headers, data: this.params });
    } else if (method === 'patch') {
      return axios.patch(url, this.params, { headers });
    } else {
      throw new Error(`Unsupported HTTP method: ${this.method}`);
    }
  }
}

/** Function to convert OpenAPI spec to function signatures and request builders */
export function openapiToFunction(openapiSpec: OpenAPIV3.Document): {
  functionSignatures: FunctionSignature[];
  requestBuilders: Record<string, ActionRequest>;
} {
  const functionSignatures: FunctionSignature[] = [];
  const requestBuilders: Record<string, ActionRequest> = {};

  // Base URL from OpenAPI spec servers
  const baseUrl = openapiSpec.servers?.[0]?.url ?? '';

  // Iterate over each path and method in the OpenAPI spec
  for (const [path, methods] of Object.entries(openapiSpec.paths)) {
    for (const [method, operation] of Object.entries(methods as OpenAPIV3.PathsObject)) {
      const operationObj = operation as OpenAPIV3.OperationObject & {
        'x-openai-isConsequential'?: boolean;
      };

      // Operation ID is used as the function name
      const operationId = operationObj.operationId || `${method}_${path}`;
      const description = operationObj.summary || operationObj.description || '';

      const parametersSchema: ParametersSchema = { type: 'object', properties: {}, required: [] };
      if (operationObj.parameters) {
        for (const param of operationObj.parameters) {
          const paramObj = param as OpenAPIV3.ParameterObject;
          parametersSchema.properties[paramObj.name] = { ...paramObj.schema };
          if (paramObj.required) {
            parametersSchema.required.push(paramObj.name);
          }
          if (paramObj.description && !('$$ref' in parametersSchema.properties[paramObj.name])) {
            parametersSchema.properties[paramObj.name].description = paramObj.description;
          }
        }
      }

      if (operationObj.requestBody) {
        const requestBody = operationObj.requestBody as OpenAPIV3.RequestBodyObject;
        const content = requestBody.content;
        const contentType = Object.keys(content)[0];
        parametersSchema.properties['requestBody'] = content[contentType].schema as
          | OpenAPIV3.ReferenceObject
          | OpenAPIV3.SchemaObject;
      }

      const functionSignature = new FunctionSignature(operationId, description, parametersSchema);
      functionSignatures.push(functionSignature);

      const actionRequest = new ActionRequest(
        baseUrl,
        path,
        method,
        operationId,
        !!operationObj['x-openai-isConsequential'], // Custom extension for consequential actions
        operationObj.requestBody ? 'application/json' : 'application/x-www-form-urlencoded',
      );

      requestBuilders[operationId] = actionRequest;
    }
  }

  return { functionSignatures, requestBuilders };
}

export type ValidationResult = {
  status: boolean;
  message: string;
  spec?: OpenAPIV3.Document;
};

export function validateAndParseOpenAPISpec(specString: string): ValidationResult {
  try {
    let parsedSpec;
    try {
      parsedSpec = JSON.parse(specString);
    } catch {
      parsedSpec = load(specString);
    }

    // Check for servers
    if (
      !parsedSpec.servers ||
      !Array.isArray(parsedSpec.servers) ||
      parsedSpec.servers.length === 0
    ) {
      return { status: false, message: 'Could not find a valid URL in `servers`' };
    }

    if (!parsedSpec.servers[0].url) {
      return { status: false, message: 'Could not find a valid URL in `servers`' };
    }

    // Check for paths
    const paths = parsedSpec.paths;
    if (!paths || typeof paths !== 'object' || Object.keys(paths).length === 0) {
      return { status: false, message: 'No paths found in the OpenAPI spec.' };
    }

    const components = parsedSpec.components?.schemas || {};
    const messages = [];

    for (const [path, methods] of Object.entries(paths)) {
      for (const [httpMethod, operation] of Object.entries(methods as OpenAPIV3.PathItemObject)) {
        // Ensure operation is a valid operation object
        const { responses } = operation as OpenAPIV3.OperationObject;
        if (typeof operation === 'object' && responses) {
          for (const [statusCode, response] of Object.entries(responses)) {
            const content = (response as OpenAPIV3.ResponseObject).content;
            if (content && content['application/json'] && content['application/json'].schema) {
              const schema = content['application/json'].schema;
              if ('$ref' in schema && typeof schema.$ref === 'string') {
                const refName = schema.$ref.split('/').pop();
                if (refName && !components[refName]) {
                  messages.push(
                    `In context=('paths', '${path}', '${httpMethod}', '${statusCode}', 'response', 'content', 'application/json', 'schema'), reference to unknown component ${refName}; using empty schema`,
                  );
                }
              }
            }
          }
        }
      }
    }

    return {
      status: true,
      message: messages.join('\n') || 'OpenAPI spec is valid.',
      spec: parsedSpec,
    };
  } catch (error) {
    return { status: false, message: 'Error parsing OpenAPI spec.' };
  }
}
