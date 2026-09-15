import type { ZodTypeAny } from 'zod';
import type { EndpointContract, SecurityScheme } from './adapter';
import { agentComponentSchemas, agentContracts } from './agents';
import { skillComponentSchemas, skillContracts } from './skills';
import { unauthorizedResponseSchema } from './errors';

/** The agent and skill management endpoints authenticate with an OIDC access token (bearer). */
export const securitySchemes: Record<string, SecurityScheme> = {
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
  UnauthorizedError: unauthorizedResponseSchema,
};

export const contracts: EndpointContract[] = [...agentContracts, ...skillContracts];
