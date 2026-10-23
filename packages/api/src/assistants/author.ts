import { logger, SystemCapabilities } from '@librechat/data-schemas';
import type { CapabilityUser, HasCapabilityFn } from '../middleware/capabilities';

interface AssistantAuthorRequest {
  params: { id?: unknown; assistant_id?: unknown };
  body?: { endpoint?: string; assistant_id?: unknown };
  query?: { endpoint?: string; assistant_id?: unknown };
  user: CapabilityUser;
  config: { endpoints?: Record<string, { privateAssistants?: boolean } | undefined> };
}

interface AssistantAuthorInput {
  req: AssistantAuthorRequest;
  openai: {
    beta: {
      assistants: {
        retrieve: (id: string) => Promise<{ metadata?: { author?: string } | null }>;
      };
    };
  };
  overrideAssistantId?: string;
}

interface AssistantAuthorQuery {
  assistantId: string;
  user?: string;
}

interface AssistantAuthorDeps {
  getAssistant: (query: { assistantId: string; user: string }) => Promise<object | null>;
  hasCapability: HasCapabilityFn;
}

function resolveAssistantId({ req, overrideAssistantId }: AssistantAuthorInput): string {
  let assistantId: string | undefined;
  for (const value of [
    overrideAssistantId,
    req.params.id,
    req.params.assistant_id,
    req.body?.assistant_id,
    req.query?.assistant_id,
  ]) {
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'string' || value.length === 0 || /\s/.test(value)) {
      throw new Error('Invalid Assistant ID');
    }
    if (assistantId !== undefined && value !== assistantId) {
      throw new Error('Conflicting Assistant IDs');
    }
    assistantId = value;
  }
  if (assistantId === undefined) {
    throw new Error('Assistant ID is required');
  }
  return assistantId;
}

/** Returns the exact resource and owner scope authorized for a subsequent local mutation. */
export function createAssistantAuthorValidator({
  getAssistant,
  hasCapability,
}: AssistantAuthorDeps): (input: AssistantAuthorInput) => Promise<AssistantAuthorQuery> {
  return async (input) => {
    const { req, openai } = input;
    const assistantId = resolveAssistantId(input);
    const endpoint = req.body?.endpoint ?? req.query?.endpoint;
    const assistantsConfig = endpoint === undefined ? undefined : req.config.endpoints?.[endpoint];
    if (!assistantsConfig?.privateAssistants) {
      return { assistantId };
    }

    let canManageAssistants = false;
    try {
      canManageAssistants = await hasCapability(req.user, SystemCapabilities.MANAGE_ASSISTANTS);
    } catch {
      logger.warn('[validateAuthor] Capability check failed, denying bypass');
    }
    if (canManageAssistants) {
      return { assistantId };
    }

    const query = { assistantId, user: req.user.id };
    const assistantDoc = await getAssistant(query);
    if (assistantDoc) {
      return query;
    }
    const assistant = await openai.beta.assistants.retrieve(assistantId);
    if (req.user.id !== assistant?.metadata?.author) {
      throw new Error('Assistant is not authored by the user');
    }
    return query;
  };
}
