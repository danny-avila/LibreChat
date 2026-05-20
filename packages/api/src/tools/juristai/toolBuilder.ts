import { openapiToFunction } from 'librechat-data-provider';
import type { OpenAPIV3 } from 'openapi-types';
import type { ActionRequest, FunctionSignature } from 'librechat-data-provider';

/**
 * Converts a curated django-hub OpenAPI spec into JuristAI tool definitions.
 *
 * Reuses LibreChat's `openapiToFunction` (the same util the Actions feature
 * uses) to derive function signatures and request builders, then namespaces the
 * tool names with `juristai__` so they never collide with user-configured
 * Actions or MCP tools. The returned `requestBuilder` is what the /api glue
 * hands to `createActionTool` for execution.
 */

export const JURISTAI_TOOL_PREFIX = 'juristai__';

export interface JuristaiToolDefinition {
  /** Namespaced name advertised to the model, e.g. `juristai__search_case`. */
  name: string;
  /** Raw OpenAPI operationId, used to look up the request builder. */
  operationId: string;
  description: string;
  parameters: FunctionSignature['parameters'];
  requestBuilder: ActionRequest;
}

const sanitizeName = (operationId: string): string => operationId.replace(/[^a-zA-Z0-9_-]/g, '_');

export function buildJuristaiTools(
  spec: OpenAPIV3.Document,
  djangoBaseUrl: string,
): JuristaiToolDefinition[] {
  const specWithServer: OpenAPIV3.Document = {
    ...spec,
    servers: [{ url: djangoBaseUrl.replace(/\/+$/, '') }],
  };

  const { functionSignatures, requestBuilders } = openapiToFunction(specWithServer, true);
  const tools: JuristaiToolDefinition[] = [];

  for (const signature of functionSignatures) {
    const operationId = signature.name;
    const requestBuilder = requestBuilders[operationId];
    if (!requestBuilder) {
      continue;
    }
    tools.push({
      name: `${JURISTAI_TOOL_PREFIX}${sanitizeName(operationId)}`,
      operationId,
      description: signature.description,
      parameters: signature.parameters,
      requestBuilder,
    });
  }

  return tools;
}
