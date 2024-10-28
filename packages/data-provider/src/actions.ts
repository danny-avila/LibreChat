import { z } from 'zod';
import axios from 'axios';
import { URL } from 'url';
import crypto from 'crypto';
import { load } from 'js-yaml';
import type { FunctionTool, Schema, Reference, ActionMetadata } from './types/assistants';
import type { OpenAPIV3 } from 'openapi-types';
import { Tools, AuthTypeEnum, AuthorizationTypeEnum } from './types/assistants';

export type ParametersSchema = {
  type: string;
  properties: Record<string, Reference | Schema>;
  required: string[];
};

export type OpenAPISchema = OpenAPIV3.SchemaObject &
  ParametersSchema & {
    items?: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject;
  };

export type ApiKeyCredentials = {
  api_key: string;
  custom_auth_header?: string;
  authorization_type?: AuthorizationTypeEnum;
};

export type OAuthCredentials = {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
};

export type Credentials = ApiKeyCredentials | OAuthCredentials;

type MediaTypeObject =
  | undefined
  | {
      [media: string]: OpenAPIV3.MediaTypeObject | undefined;
    };

type RequestBodyObject = Omit<OpenAPIV3.RequestBodyObject, 'content'> & {
  content: MediaTypeObject;
};

export function sha1(input: string) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

export function createURL(domain: string, path: string) {
  const cleanDomain = domain.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  const fullURL = `${cleanDomain}/${cleanPath}`;
  return new URL(fullURL).toString();
}

const schemaTypeHandlers: Record<string, (schema: OpenAPISchema) => z.ZodTypeAny> = {
  string: (schema) => {
    if (schema.enum) {
      return z.enum(schema.enum as [string, ...string[]]);
    }

    let stringSchema = z.string();
    if (schema.minLength !== undefined) {
      stringSchema = stringSchema.min(schema.minLength);
    }
    if (schema.maxLength !== undefined) {
      stringSchema = stringSchema.max(schema.maxLength);
    }
    return stringSchema;
  },
  number: (schema) => {
    let numberSchema = z.number();
    if (schema.minimum !== undefined) {
      numberSchema = numberSchema.min(schema.minimum);
    }
    if (schema.maximum !== undefined) {
      numberSchema = numberSchema.max(schema.maximum);
    }
    return numberSchema;
  },
  integer: (schema) => (schemaTypeHandlers.number(schema) as z.ZodNumber).int(),
  boolean: () => z.boolean(),
  array: (schema) => {
    if (schema.items) {
      const zodSchema = openAPISchemaToZod(schema.items as OpenAPISchema);
      if (zodSchema) {
        return z.array(zodSchema);
      }

      return z.array(z.unknown());
    }
    return z.array(z.unknown());
  },
  object: (schema) => {
    const shape: { [key: string]: z.ZodTypeAny } = {};
    if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, value]) => {
        const zodSchema = openAPISchemaToZod(value as OpenAPISchema);
        shape[key] = zodSchema || z.unknown();
        if (schema.required && schema.required.includes(key)) {
          shape[key] = shape[key].describe(value.description || '');
        } else {
          shape[key] = shape[key].optional().describe(value.description || '');
        }
      });
    }
    return z.object(shape);
  },
};

function openAPISchemaToZod(schema: OpenAPISchema): z.ZodTypeAny | undefined {
  if (schema.type === 'object' && Object.keys(schema.properties || {}).length === 0) {
    return undefined;
  }

  const handler = schemaTypeHandlers[schema.type as string] || (() => z.unknown());
  return handler(schema);
}

export class FunctionSignature {
  name: string;
  description: string;
  parameters: ParametersSchema;

  constructor(name: string, description: string, parameters: ParametersSchema) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
  }

  toObjectTool(): FunctionTool {
    return {
      type: Tools.function,
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}
class RequestConfig {
  constructor(
    readonly domain: string,
    readonly basePath: string,
    readonly method: string,
    readonly operation: string,
    readonly isConsequential: boolean,
    readonly contentType: string,
  ) {}
}

class RequestExecutor {
  path: string;
  params?: object;
  private operationHash?: string;
  private authHeaders: Record<string, string> = {};
  private authToken?: string;

  constructor(private config: RequestConfig) {
    this.path = config.basePath;
  }

  setParams(params: object) {
    this.operationHash = sha1(JSON.stringify(params));
    this.params = Object.assign({}, params);

    for (const [key, value] of Object.entries(params)) {
      const paramPattern = `{${key}}`;
      if (this.path.includes(paramPattern)) {
        this.path = this.path.replace(paramPattern, encodeURIComponent(value as string));
        delete (this.params as Record<string, unknown>)[key];
      }
    }
    return this;
  }

  async setAuth(metadata: ActionMetadata) {
    if (!metadata.auth) {
      return this;
    }

    const {
      type,
      /* API Key */
      authorization_type,
      custom_auth_header,
      /* OAuth */
      authorization_url,
      client_url,
      scope,
      token_exchange_method,
    } = metadata.auth;

    const {
      /* API Key */
      api_key,
      /* OAuth */
      oauth_client_id,
      oauth_client_secret,
    } = metadata;

    const isApiKey = api_key && type === AuthTypeEnum.ServiceHttp;
    const isOAuth =
      oauth_client_id &&
      oauth_client_secret &&
      type === AuthTypeEnum.OAuth &&
      authorization_url &&
      client_url &&
      scope &&
      token_exchange_method;

    if (isApiKey && authorization_type === AuthorizationTypeEnum.Basic) {
      const basicToken = Buffer.from(api_key).toString('base64');
      this.authHeaders['Authorization'] = `Basic ${basicToken}`;
    } else if (isApiKey && authorization_type === AuthorizationTypeEnum.Bearer) {
      this.authHeaders['Authorization'] = `Bearer ${api_key}`;
    } else if (
      isApiKey &&
      authorization_type === AuthorizationTypeEnum.Custom &&
      custom_auth_header
    ) {
      this.authHeaders[custom_auth_header] = api_key;
    } else if (isOAuth) {
      if (!this.authToken) {
        const tokenResponse = await axios.post(
          client_url,
          {
            client_id: oauth_client_id,
            client_secret: oauth_client_secret,
            scope: scope,
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
    return this;
  }

  async execute() {
    const url = createURL(this.config.domain, this.path);
    const headers = {
      ...this.authHeaders,
      'Content-Type': this.config.contentType,
    };

    const method = this.config.method.toLowerCase();

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
      throw new Error(`Unsupported HTTP method: ${method}`);
    }
  }
}

export class ActionRequest {
  private config: RequestConfig;

  constructor(
    domain: string,
    path: string,
    method: string,
    operation: string,
    isConsequential: boolean,
    contentType: string,
  ) {
    this.config = new RequestConfig(domain, path, method, operation, isConsequential, contentType);
  }

  // Add getters to maintain backward compatibility
  get domain() {
    return this.config.domain;
  }
  get path() {
    return this.config.basePath;
  }
  get method() {
    return this.config.method;
  }
  get operation() {
    return this.config.operation;
  }
  get isConsequential() {
    return this.config.isConsequential;
  }
  get contentType() {
    return this.config.contentType;
  }

  createExecutor() {
    return new RequestExecutor(this.config);
  }

  // Maintain backward compatibility by delegating to a new executor
  setParams(params: object) {
    const executor = this.createExecutor();
    executor.setParams(params);
    return executor;
  }

  async setAuth(metadata: ActionMetadata) {
    const executor = this.createExecutor();
    return executor.setAuth(metadata);
  }

  async execute() {
    const executor = this.createExecutor();
    return executor.execute();
  }
}

export function resolveRef(
  schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | RequestBodyObject,
  components?: OpenAPIV3.ComponentsObject,
): OpenAPIV3.SchemaObject {
  if ('$ref' in schema && components) {
    const refPath = schema.$ref.replace(/^#\/components\/schemas\//, '');
    const resolvedSchema = components.schemas?.[refPath];
    if (!resolvedSchema) {
      throw new Error(`Reference ${schema.$ref} not found`);
    }
    return resolveRef(resolvedSchema, components);
  }
  return schema as OpenAPIV3.SchemaObject;
}

function sanitizeOperationId(input: string) {
  return input.replace(/[^a-zA-Z0-9_-]/g, '');
}

/** Function to convert OpenAPI spec to function signatures and request builders */
export function openapiToFunction(
  openapiSpec: OpenAPIV3.Document,
  generateZodSchemas = false,
): {
  functionSignatures: FunctionSignature[];
  requestBuilders: Record<string, ActionRequest>;
  zodSchemas?: Record<string, z.ZodTypeAny>;
} {
  const functionSignatures: FunctionSignature[] = [];
  const requestBuilders: Record<string, ActionRequest> = {};
  const zodSchemas: Record<string, z.ZodTypeAny> = {};
  const baseUrl = openapiSpec.servers?.[0]?.url ?? '';

  // Iterate over each path and method in the OpenAPI spec
  for (const [path, methods] of Object.entries(openapiSpec.paths)) {
    for (const [method, operation] of Object.entries(methods as OpenAPIV3.PathsObject)) {
      const operationObj = operation as OpenAPIV3.OperationObject & {
        'x-openai-isConsequential'?: boolean;
      };

      // Operation ID is used as the function name
      const defaultOperationId = `${method}_${path}`;
      const operationId = operationObj.operationId || sanitizeOperationId(defaultOperationId);
      const description = operationObj.summary || operationObj.description || '';

      const parametersSchema: OpenAPISchema = {
        type: 'object',
        properties: {},
        required: [],
      };

      if (operationObj.parameters) {
        for (const param of operationObj.parameters) {
          const paramObj = param as OpenAPIV3.ParameterObject;
          const resolvedSchema = resolveRef(
            { ...paramObj.schema } as OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
            openapiSpec.components,
          );
          parametersSchema.properties[paramObj.name] = resolvedSchema;
          if (paramObj.required === true) {
            parametersSchema.required.push(paramObj.name);
          }
        }
      }

      if (operationObj.requestBody) {
        const requestBody = operationObj.requestBody as RequestBodyObject;
        const content = requestBody.content;
        const contentType = Object.keys(content ?? {})[0];
        const schema = content?.[contentType]?.schema;
        const resolvedSchema = resolveRef(
          schema as OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
          openapiSpec.components,
        );
        parametersSchema.properties = {
          ...parametersSchema.properties,
          ...resolvedSchema.properties,
        };
        if (resolvedSchema.required) {
          parametersSchema.required.push(...resolvedSchema.required);
        }
      }

      const functionSignature = new FunctionSignature(operationId, description, parametersSchema);
      functionSignatures.push(functionSignature);

      const actionRequest = new ActionRequest(
        baseUrl,
        path,
        method,
        operationId,
        !!(operationObj['x-openai-isConsequential'] ?? false), // Custom extension for consequential actions
        operationObj.requestBody ? 'application/json' : 'application/x-www-form-urlencoded',
      );

      requestBuilders[operationId] = actionRequest;

      if (generateZodSchemas && Object.keys(parametersSchema.properties).length > 0) {
        const schema = openAPISchemaToZod(parametersSchema);
        if (schema) {
          zodSchemas[operationId] = schema;
        }
      }
    }
  }

  return { functionSignatures, requestBuilders, zodSchemas };
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
        const { responses } = operation as OpenAPIV3.OperationObject | { responses: undefined };
        if (typeof operation === 'object' && responses) {
          for (const [statusCode, response] of Object.entries(responses)) {
            const content = (response as OpenAPIV3.ResponseObject).content as MediaTypeObject;
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
