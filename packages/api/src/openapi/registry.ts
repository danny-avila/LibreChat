import type { ZodTypeAny } from 'zod';
import type { EndpointContract, SecurityScheme } from './adapter';
import { agentComponentSchemas, agentContracts } from './agents';
import { skillComponentSchemas, skillContracts } from './skills';

/** The public Agents API accepts an API key or an OIDC token, both as a bearer token. */
export const securitySchemes: Record<string, SecurityScheme> = {
  apiKeyBearer: {
    type: 'http',
    scheme: 'bearer',
    description: 'A LibreChat API key, sent as a bearer token.',
  },
  oidcBearer: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'An OIDC access token, sent as a bearer token.',
  },
};

export const componentSchemas: Record<string, ZodTypeAny> = {
  ...agentComponentSchemas,
  ...skillComponentSchemas,
};

export const contracts: EndpointContract[] = [...agentContracts, ...skillContracts];
