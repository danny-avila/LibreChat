import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { AgentCapabilities, Permissions, PermissionTypes } from 'librechat-data-provider';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@librechat/client';
import type { AgentInstructionPrompt, TPrompt } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { AgentForm } from '~/common';
import {
  useAgentInstructionPromptPreview,
  useGetAllPromptGroups,
  useGetPrompts,
} from '~/data-provider';
import { useDebounce, useGetAgentsConfig, useHasAccess, useLocalize } from '~/hooks';
import CreatePromptDialog from '~/components/Prompts/dialogs/CreatePromptDialog';
import { VariableEditor } from '~/components/Variables';

type InstructionSource = 'inline' | AgentInstructionPrompt['source'];
const CREATE_PROMPT_VALUE = 'create-prompt';
const DEPLOYED_VERSION_VALUE = 'deployed';

function promptTime(prompt: TPrompt): number {
  const value = new Date(prompt.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

export default function Instructions({
  advancedPromptsEnabled,
}: {
  advancedPromptsEnabled: boolean;
}) {
  const localize = useLocalize();
  const { agentsConfig } = useGetAgentsConfig();
  const promptReferencesEnabled =
    agentsConfig?.capabilities?.includes(AgentCapabilities.instruction_prompts) ?? false;
  const canCreatePrompts = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.CREATE,
  });
  const { control, getValues, getFieldState, setValue } = useFormContext<AgentForm>();
  const agentId = useWatch({ control, name: 'id' });
  const reference = useWatch({ control, name: 'instruction_prompt' });
  const [source, setSource] = useState<InstructionSource>(reference?.source ?? 'inline');
  const [createPromptOpen, setCreatePromptOpen] = useState(false);
  const referenceDrafts = useRef<
    Partial<Record<AgentInstructionPrompt['source'], AgentInstructionPrompt>>
  >(reference ? { [reference.source]: reference } : {});

  useEffect(() => {
    const nextReference = getValues('instruction_prompt');
    referenceDrafts.current = nextReference ? { [nextReference.source]: nextReference } : {};
    setSource(nextReference?.source ?? 'inline');
  }, [agentId, getValues]);

  const groupsQuery = useGetAllPromptGroups(undefined, {
    enabled: promptReferencesEnabled && source === 'librechat',
  });
  const groups = groupsQuery.data ?? [];
  const groupId = reference?.source === 'librechat' ? reference.promptId : '';
  const promptsQuery = useGetPrompts(
    { groupId },
    { enabled: promptReferencesEnabled && source === 'librechat' && groupId.length > 0 },
  );
  const prompts = useMemo(
    () =>
      [...(promptsQuery.data ?? [])].sort((a, b) => {
        const byTime = promptTime(a) - promptTime(b);
        return byTime !== 0 ? byTime : String(a._id ?? '').localeCompare(String(b._id ?? ''));
      }),
    [promptsQuery.data],
  );
  const selectedGroup = groups.find((group) => group._id === groupId);
  const selectedPrompt =
    reference?.source === 'librechat' && reference.version != null
      ? prompts.find((prompt) => prompt._id === reference.versionId)
      : prompts.find((prompt) => prompt._id === selectedGroup?.productionId);
  let selectedPromptVersion: number | undefined;
  if (reference?.source === 'librechat' && reference.version != null) {
    selectedPromptVersion = reference.version;
  } else if (selectedPrompt != null) {
    selectedPromptVersion = prompts.indexOf(selectedPrompt) + 1;
  }
  const langfuseName = reference?.source === 'langfuse' ? reference.name : '';
  const debouncedLangfuseName = useDebounce(langfuseName, 300);
  const langfuseVersion = reference?.source === 'langfuse' ? reference.version : undefined;
  const langfuseDestinationId =
    reference?.source === 'langfuse' ? reference.destinationId : undefined;
  const langfuseQuery = useAgentInstructionPromptPreview(
    debouncedLangfuseName,
    langfuseVersion,
    {
      enabled:
        promptReferencesEnabled && source === 'langfuse' && debouncedLangfuseName.trim().length > 0,
    },
    langfuseDestinationId,
  );

  const updateReference = (next: AgentInstructionPrompt | undefined) => {
    if (next) {
      referenceDrafts.current[next.source] = next;
    }
    setValue('instruction_prompt', next, { shouldDirty: true, shouldValidate: true });
  };

  const changeSource = (next: InstructionSource) => {
    if (reference) {
      referenceDrafts.current[reference.source] = reference;
    }
    setSource(next);
    updateReference(next === 'inline' ? undefined : referenceDrafts.current[next]);
  };

  const selectGroup = (nextGroupId: string) => {
    if (nextGroupId === CREATE_PROMPT_VALUE && canCreatePrompts) {
      setCreatePromptOpen(true);
      return;
    }
    const group = groups.find((candidate) => candidate._id === nextGroupId);
    updateReference(
      group?._id ? { source: 'librechat', promptId: group._id, name: group.name } : undefined,
    );
  };

  const selectLibreChatVersion = (value: string) => {
    if (reference?.source !== 'librechat') {
      return;
    }
    if (value === DEPLOYED_VERSION_VALUE) {
      updateReference({ ...reference, version: undefined, versionId: undefined });
      return;
    }

    const index = prompts.findIndex((prompt) => prompt._id === value);
    if (index < 0) {
      return;
    }
    updateReference({
      ...reference,
      version:
        value === reference.versionId && reference.version != null ? reference.version : index + 1,
      versionId: value,
    });
  };

  const updateLangfuse = (name: string, version?: number) => {
    updateReference(
      name.trim().length > 0
        ? { source: 'langfuse', name, version, destinationId: langfuseDestinationId }
        : undefined,
    );
  };

  let status: ReactNode = null;
  if (!promptReferencesEnabled && source !== 'inline') {
    status = <span role="status">{localize('com_ui_disabled')}</span>;
  } else if (source === 'librechat') {
    if (groupsQuery.isLoading || (groupId.length > 0 && promptsQuery.isLoading)) {
      status = <span role="status">{localize('com_ui_loading')}</span>;
    } else if (groupsQuery.isError || (groupId.length > 0 && promptsQuery.isError)) {
      status = (
        <span role="alert">
          {localize('com_agents_prompt_load_error')}{' '}
          <button
            type="button"
            className="underline"
            onClick={() =>
              void (groupsQuery.isError ? groupsQuery.refetch() : promptsQuery.refetch())
            }
          >
            {localize('com_ui_retry')}
          </button>
        </span>
      );
    } else if (groupsQuery.isSuccess && groups.length === 0) {
      status = <span>{localize('com_agents_prompt_empty')}</span>;
    } else if (groupId && promptsQuery.isSuccess && prompts.length === 0) {
      status = <span role="alert">{localize('com_agents_prompt_versions_empty')}</span>;
    } else if (
      reference?.source === 'librechat' &&
      groupId.length > 0 &&
      prompts.length > 0 &&
      selectedPrompt == null
    ) {
      status = <span role="alert">{localize('com_agents_prompt_missing')}</span>;
    } else if (selectedPrompt?.type != null && selectedPrompt.type !== 'text') {
      status = <span role="alert">{localize('com_agents_prompt_unsupported')}</span>;
    } else if (reference?.source === 'librechat' && selectedPromptVersion != null) {
      status = (
        <span role="status">
          {localize('com_agents_prompt_resolved', { version: selectedPromptVersion })}
        </span>
      );
    }
  } else if (source === 'langfuse' && langfuseName) {
    if (langfuseQuery.isLoading || langfuseQuery.isFetching) {
      status = <span role="status">{localize('com_ui_loading')}</span>;
    } else if (langfuseQuery.isError) {
      status = (
        <span role="alert">
          {localize('com_agents_prompt_load_error')}{' '}
          <button type="button" className="underline" onClick={() => void langfuseQuery.refetch()}>
            {localize('com_ui_retry')}
          </button>
        </span>
      );
    } else if (langfuseQuery.data) {
      status = (
        <span role="status">
          {localize('com_agents_prompt_resolved', { version: langfuseQuery.data.version })}
          {langfuseQuery.data.cached ? ` · ${localize('com_agents_prompt_cached')}` : ''}
        </span>
      );
    }
  }

  return (
    <Controller
      name="instructions"
      control={control}
      rules={{
        validate: () => {
          if (
            source === 'inline' ||
            (agentId &&
              reference &&
              (!promptReferencesEnabled || !getFieldState('instruction_prompt').isDirty))
          ) {
            return true;
          }
          if (reference?.source !== source) {
            return localize('com_ui_field_required');
          }
          if (source === 'librechat') {
            if (selectedPrompt == null) {
              return localize('com_agents_prompt_missing');
            }
            if (selectedPrompt.type != null && selectedPrompt.type !== 'text') {
              return localize('com_agents_prompt_unsupported');
            }
          }
          return true;
        },
      }}
      render={({ field, fieldState: { error } }) => (
        <div className="mb-3 flex flex-col gap-2">
          <label
            className="text-[11px] font-medium uppercase text-text-secondary"
            htmlFor="instruction-source"
          >
            {localize('com_agents_prompt_source')}
          </label>
          <Select
            value={source}
            onValueChange={(value) => changeSource(value as InstructionSource)}
          >
            <SelectTrigger
              id="instruction-source"
              aria-label={localize('com_agents_prompt_source')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inline">{localize('com_agents_prompt_source_inline')}</SelectItem>
              {(promptReferencesEnabled || source === 'librechat') && (
                <SelectItem value="librechat" disabled={!promptReferencesEnabled}>
                  {localize('com_agents_prompt_source_librechat')}
                </SelectItem>
              )}
              {(promptReferencesEnabled || source === 'langfuse') && (
                <SelectItem value="langfuse" disabled={!promptReferencesEnabled}>
                  {localize('com_agents_prompt_source_langfuse')}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {source === 'inline' && (
            <VariableEditor
              id="instructions"
              label={localize('com_ui_instructions')}
              value={field.value ?? ''}
              onChange={field.onChange}
              onBlur={field.onBlur}
              inputRef={field.ref}
              placeholder={localize('com_agents_instructions_placeholder')}
              className="min-h-[88px] resize-y"
              labelClassName="block text-[11px] font-medium uppercase tracking-wide text-text-secondary"
              rows={3}
              required={true}
              invalid={error != null}
            />
          )}
          {source === 'librechat' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                value={groupId}
                onValueChange={selectGroup}
                disabled={!promptReferencesEnabled}
              >
                <SelectTrigger aria-label={localize('com_agents_prompt_select')}>
                  <SelectValue
                    placeholder={
                      groupsQuery.isSuccess && groups.length === 0
                        ? localize('com_agents_prompt_empty')
                        : localize('com_agents_prompt_select')
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {groupsQuery.isSuccess && groups.length === 0 && canCreatePrompts && (
                    <SelectItem value={CREATE_PROMPT_VALUE}>
                      {localize('com_agents_prompt_create')}
                    </SelectItem>
                  )}
                  {groups
                    .filter((group) => group._id != null)
                    .map((group) => (
                      <SelectItem key={group._id} value={group._id as string}>
                        {group.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select
                disabled={
                  !advancedPromptsEnabled ||
                  !promptReferencesEnabled ||
                  !groupId ||
                  prompts.length === 0
                }
                value={
                  advancedPromptsEnabled && reference?.source === 'librechat'
                    ? (reference.versionId ?? DEPLOYED_VERSION_VALUE)
                    : DEPLOYED_VERSION_VALUE
                }
                onValueChange={selectLibreChatVersion}
              >
                <SelectTrigger aria-label={localize('com_agents_prompt_version')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEPLOYED_VERSION_VALUE}>
                    {localize('com_agents_prompt_deployed')}
                  </SelectItem>
                  {advancedPromptsEnabled &&
                    prompts.map((prompt, index) => {
                      if (prompt._id == null) {
                        return null;
                      }
                      const version =
                        reference?.source === 'librechat' &&
                        prompt._id === reference.versionId &&
                        reference.version != null
                          ? reference.version
                          : index + 1;
                      return (
                        <SelectItem key={prompt._id} value={prompt._id}>
                          {localize('com_agents_prompt_version_number', { version })}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
          )}
          {source === 'langfuse' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                aria-label={localize('com_agents_prompt_name')}
                value={langfuseName}
                disabled={!promptReferencesEnabled}
                placeholder={localize('com_agents_prompt_name')}
                onChange={(event) => updateLangfuse(event.target.value, langfuseVersion)}
              />
              <div className="flex gap-2">
                <Select
                  disabled={!promptReferencesEnabled}
                  value={langfuseVersion == null ? 'latest' : 'pinned'}
                  onValueChange={(value) =>
                    updateLangfuse(langfuseName, value === 'latest' ? undefined : 1)
                  }
                >
                  <SelectTrigger aria-label={localize('com_agents_prompt_version')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">{localize('com_agents_prompt_latest')}</SelectItem>
                    <SelectItem value="pinned">{localize('com_agents_prompt_pinned')}</SelectItem>
                  </SelectContent>
                </Select>
                {langfuseVersion != null && (
                  <Input
                    aria-label={localize('com_agents_prompt_version')}
                    type="number"
                    min={1}
                    value={langfuseVersion}
                    disabled={!promptReferencesEnabled}
                    onChange={(event) => updateLangfuse(langfuseName, Number(event.target.value))}
                  />
                )}
              </div>
            </div>
          )}
          <div className="text-xs text-text-secondary">{status}</div>
          <CreatePromptDialog open={createPromptOpen} onOpenChange={setCreatePromptOpen} />
          {error && (
            <span
              className="mt-1 text-xs text-text-destructive transition duration-300 ease-in-out"
              role="alert"
            >
              {error.message ?? localize('com_ui_field_required')}
            </span>
          )}
        </div>
      )}
    />
  );
}
