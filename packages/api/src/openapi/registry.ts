import type { ZodTypeAny } from 'zod';
import type { EndpointContract, SecurityScheme } from './adapter';
import {
  errorMessageResponseSchema,
  accountDeletionResponseSchema,
  messageResponseSchema,
  jsonParseErrorSchema,
} from './errors';
import { agentComponentSchemas, agentContracts } from './agents';
import { skillComponentSchemas, skillContracts } from './skills';

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
  ErrorMessage: errorMessageResponseSchema,
  AccountDeletionConflict: accountDeletionResponseSchema,
  MessageError: messageResponseSchema,
  JsonParseError: jsonParseErrorSchema,
};

/**
 * Constraints the Zod-to-OpenAPI converter cannot emit, applied to the generated component.
 * `SkillUpdateRequest`'s object-level `.refine()` (at least one update field) is lost in
 * conversion; `minProperties: 2` keeps `expectedVersion` plus at least one real field.
 */
export const componentSchemaOverrides: Record<string, Record<string, unknown>> = {
  SkillUpdateRequest: { minProperties: 2 },
};

export const contracts: EndpointContract[] = [...agentContracts, ...skillContracts];
