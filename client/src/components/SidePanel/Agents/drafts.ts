import type { AgentForm, ExtendedFile } from '~/common';

export const NEW_AGENT_DRAFT_KEY = 'new';

export type AgentDraftValues = Partial<AgentForm>;

const drafts = new Map<string, AgentDraftValues>();

export function getAgentDraftKey(agentId?: string | null): string {
  return agentId || NEW_AGENT_DRAFT_KEY;
}

const sanitizeFile = ({ file: _file, ...value }: ExtendedFile): ExtendedFile => value;

const sanitizeFileEntries = (
  entries?: Array<[string, ExtendedFile]>,
): Array<[string, ExtendedFile]> | undefined =>
  entries?.map(([id, file]): [string, ExtendedFile] => [id, sanitizeFile(file)]);

export function sanitizeAgentDraft(values: AgentForm): AgentDraftValues {
  const {
    avatar_file: _avatarFile,
    avatar_preview: _avatarPreview,
    avatar_action: _avatarAction,
    ...draft
  } = values;

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

export function getAgentDraft(agentId?: string | null): AgentDraftValues | undefined {
  return drafts.get(getAgentDraftKey(agentId));
}

export function saveAgentDraft(agentId: string | null | undefined, values: AgentForm): void {
  drafts.set(getAgentDraftKey(agentId), sanitizeAgentDraft(values));
}

export function clearAgentDraft(agentId?: string | null): void {
  drafts.delete(getAgentDraftKey(agentId));
}

export function clearAgentDrafts(agentIds: Array<string | null | undefined>): void {
  agentIds.forEach(clearAgentDraft);
}

export function clearAllAgentDrafts(): void {
  drafts.clear();
}
