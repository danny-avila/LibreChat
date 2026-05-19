import type { AgentForm, ExtendedFile } from '~/common';

const NEW_AGENT_DRAFT_KEY = 'new';

export type AgentDraftValues = Partial<AgentForm>;

const drafts = new Map<string, AgentDraftValues>();

export function getAgentDraftKey(agentId?: string | null, userId?: string | null): string {
  return `${userId ?? 'anonymous'}:${agentId ?? NEW_AGENT_DRAFT_KEY}`;
}

const sanitizeFile = (value: ExtendedFile): ExtendedFile => {
  if (!value.file) {
    return value;
  }

  const { file: _file, ...sanitized } = value;
  return sanitized;
};

const sanitizeFileEntries = (
  entries?: Array<[string, ExtendedFile]>,
): Array<[string, ExtendedFile]> | undefined =>
  entries?.map(([id, file]): [string, ExtendedFile] => [id, sanitizeFile(file)]);

/** Strips non-serializable File objects and avatar upload state; preserves avatar reset intent. */
export function sanitizeAgentDraft(values: AgentForm): AgentDraftValues {
  const {
    avatar_file: _avatarFile,
    avatar_preview: _avatarPreview,
    avatar_action: avatarAction,
    ...baseDraft
  } = values;
  const draft: AgentDraftValues = { ...baseDraft };

  if (avatarAction === 'reset') {
    draft.avatar_action = avatarAction;
    draft.avatar_preview = '';
  }

  if (typeof draft.agent === 'object' && draft.agent != null) {
    draft.agent = {
      ...draft.agent,
      context_files: sanitizeFileEntries(draft.agent.context_files),
      knowledge_files: sanitizeFileEntries(draft.agent.knowledge_files),
      code_files: sanitizeFileEntries(draft.agent.code_files),
    };
  }

  return draft;
}

export function getAgentDraft(
  agentId?: string | null,
  userId?: string | null,
): AgentDraftValues | undefined {
  return drafts.get(getAgentDraftKey(agentId, userId));
}

export function saveAgentDraft(
  agentId: string | null | undefined,
  values: AgentForm,
  userId?: string | null,
): void {
  drafts.set(getAgentDraftKey(agentId, userId), sanitizeAgentDraft(values));
}

export function clearAgentDraft(agentId?: string | null, userId?: string | null): void {
  drafts.delete(getAgentDraftKey(agentId, userId));
}

export function clearAgentDrafts(
  agentIds: Array<string | null | undefined>,
  userId?: string | null,
): void {
  agentIds.forEach((agentId) => clearAgentDraft(agentId, userId));
}

export function clearAllAgentDrafts(): void {
  drafts.clear();
}
