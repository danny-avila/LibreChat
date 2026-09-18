import { PermissionBits } from 'librechat-data-provider';
import type {
  AgentInstructionPrompt,
  ResolvedAgentInstructionPrompt,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { RequestRoleCache } from '../../middleware/access';

export type AgentInstructionPromptResult = ResolvedAgentInstructionPrompt & {
  prompt: string;
};

export type AgentInstructionPromptContext = {
  userId: string;
  role?: string;
  appConfig?: AppConfig;
  signal?: AbortSignal;
  roleCache?: RequestRoleCache;
};

export class AgentInstructionPromptError extends Error {
  constructor(
    public readonly code:
      | 'access_denied'
      | 'invalid_response'
      | 'not_configured'
      | 'not_found'
      | 'retrieval_failed'
      | 'unsupported_type',
    message: string,
    public readonly statusCode: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'AgentInstructionPromptError';
  }
}

export interface AgentInstructionPromptProvider {
  resolve(
    reference: AgentInstructionPrompt,
    context: AgentInstructionPromptContext,
  ): Promise<AgentInstructionPromptResult>;
}

type LibreChatPromptGroup = {
  name?: string | null;
};

type LibreChatPrompt = {
  _id?: string;
  prompt: string;
  type?: string;
  createdAt?: string | Date;
};

export interface AgentInstructionPromptResolverDeps {
  getLibreChatPromptPermissions: (input: {
    userId: string;
    role?: string;
    promptId: string;
  }) => Promise<number>;
  canUseLibreChatPrompts: (input: {
    userId: string;
    role?: string;
    roleCache?: RequestRoleCache;
  }) => Promise<boolean>;
  getLibreChatPromptGroup: (promptId: string) => Promise<LibreChatPromptGroup | null>;
  getLibreChatPrompts: (promptId: string) => Promise<LibreChatPrompt[]>;
  langfuse: AgentInstructionPromptProvider;
}

function timeOf(prompt: LibreChatPrompt): number {
  if (prompt.createdAt == null) {
    return 0;
  }
  const value = new Date(prompt.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function sortPrompts(prompts: LibreChatPrompt[]): LibreChatPrompt[] {
  return [...prompts].sort((left, right) => {
    const byTime = timeOf(left) - timeOf(right);
    if (byTime !== 0) {
      return byTime;
    }
    return String(left._id ?? '').localeCompare(String(right._id ?? ''));
  });
}

export function createAgentInstructionPromptResolver(
  deps: AgentInstructionPromptResolverDeps,
): AgentInstructionPromptProvider {
  return {
    async resolve(reference, context) {
      if (reference.source === 'langfuse') {
        return deps.langfuse.resolve(reference, context);
      }

      const [canUsePrompts, permissions] = await Promise.all([
        deps.canUseLibreChatPrompts({
          userId: context.userId,
          role: context.role,
          roleCache: context.roleCache,
        }),
        deps.getLibreChatPromptPermissions({
          userId: context.userId,
          role: context.role,
          promptId: reference.promptId,
        }),
      ]);
      if (!canUsePrompts) {
        throw new AgentInstructionPromptError('access_denied', 'Prompt use is disabled', 403);
      }
      if ((permissions & PermissionBits.VIEW) !== PermissionBits.VIEW) {
        throw new AgentInstructionPromptError(
          'access_denied',
          'You no longer have access to the selected LibreChat prompt',
          403,
        );
      }

      const [group, records] = await Promise.all([
        deps.getLibreChatPromptGroup(reference.promptId),
        deps.getLibreChatPrompts(reference.promptId),
      ]);
      if (!group) {
        throw new AgentInstructionPromptError(
          'not_found',
          'The selected LibreChat prompt no longer exists',
          404,
        );
      }

      if (!Array.isArray(records)) {
        throw new AgentInstructionPromptError(
          'retrieval_failed',
          'LibreChat could not retrieve the selected prompt',
          502,
          true,
        );
      }
      const prompts = sortPrompts(records);
      const version = reference.version ?? prompts.length;
      const selected =
        reference.versionId == null
          ? prompts[version - 1]
          : prompts.find((prompt) => String(prompt._id) === reference.versionId);
      if (!selected) {
        throw new AgentInstructionPromptError(
          'not_found',
          `LibreChat prompt version ${version} no longer exists`,
          404,
        );
      }
      if (selected.type != null && selected.type !== 'text') {
        throw new AgentInstructionPromptError(
          'unsupported_type',
          'Agent instructions require a LibreChat text prompt',
          422,
        );
      }
      if (selected.prompt.trim() === '') {
        throw new AgentInstructionPromptError(
          'invalid_response',
          'The selected LibreChat prompt is empty',
          422,
        );
      }

      return {
        prompt: selected.prompt,
        source: 'librechat',
        name: group.name?.trim() || reference.name,
        version,
      };
    },
  };
}

export async function resolveAgentInstructionPrompt({
  agent,
  context,
  resolver,
}: {
  agent: {
    instructions?: string | null;
    instruction_prompt?: AgentInstructionPrompt | null;
    resolved_instruction_prompt?: ResolvedAgentInstructionPrompt;
  };
  context: AgentInstructionPromptContext;
  resolver?: AgentInstructionPromptProvider;
}): Promise<void> {
  const reference = agent.instruction_prompt;
  if (!reference) {
    return;
  }
  if (!resolver) {
    throw new AgentInstructionPromptError(
      'not_configured',
      'Agent instruction prompt resolution is not configured',
      503,
      true,
    );
  }

  const { prompt, ...resolution } = await resolver.resolve(reference, context);
  agent.instructions = prompt;
  agent.resolved_instruction_prompt = resolution;
}
