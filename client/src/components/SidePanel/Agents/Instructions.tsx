import { useEffect, useMemo, useState } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
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
import { VariableEditor } from '~/components/Variables';
import { useDebounce, useLocalize } from '~/hooks';

type InstructionSource = 'inline' | AgentInstructionPrompt['source'];

function promptTime(prompt: TPrompt): number {
  const value = new Date(prompt.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

export default function Instructions() {
  const localize = useLocalize();
  const { control, getValues, setValue } = useFormContext<AgentForm>();
  const agentId = useWatch({ control, name: 'id' });
  const reference = useWatch({ control, name: 'instruction_prompt' });
  const [source, setSource] = useState<InstructionSource>(reference?.source ?? 'inline');

  useEffect(() => {
    setSource(getValues('instruction_prompt')?.source ?? 'inline');
  }, [agentId, getValues]);

  const groupsQuery = useGetAllPromptGroups(undefined, { enabled: source === 'librechat' });
  const groups = groupsQuery.data ?? [];
  const groupId = reference?.source === 'librechat' ? reference.promptId : '';
  const promptsQuery = useGetPrompts(
    { groupId },
    { enabled: source === 'librechat' && groupId.length > 0 },
  );
  const prompts = useMemo(
    () => [...(promptsQuery.data ?? [])].sort((a, b) => promptTime(a) - promptTime(b)),
    [promptsQuery.data],
  );
  const selectedPrompt =
    reference?.source === 'librechat' && reference.version != null
      ? prompts.find((prompt) => prompt._id === reference.versionId)
      : prompts.at(-1);
  const langfuseName = reference?.source === 'langfuse' ? reference.name : '';
  const debouncedLangfuseName = useDebounce(langfuseName, 300);
  const langfuseVersion = reference?.source === 'langfuse' ? reference.version : undefined;
  const langfuseQuery = useAgentInstructionPromptPreview(debouncedLangfuseName, langfuseVersion, {
    enabled: source === 'langfuse' && debouncedLangfuseName.trim().length > 0,
  });

  const updateReference = (next: AgentInstructionPrompt | undefined) =>
    setValue('instruction_prompt', next, { shouldDirty: true, shouldValidate: true });

  const changeSource = (next: InstructionSource) => {
    setSource(next);
    if (next === 'inline' || reference?.source !== next) {
      updateReference(undefined);
    }
  };

  const selectGroup = (nextGroupId: string) => {
    const group = groups.find((candidate) => candidate._id === nextGroupId);
    updateReference(
      group?._id ? { source: 'librechat', promptId: group._id, name: group.name } : undefined,
    );
  };

  const updateLangfuse = (name: string, version = langfuseVersion) => {
    updateReference(name.trim().length > 0 ? { source: 'langfuse', name, version } : undefined);
  };

  let status: ReactNode = null;
  if (source === 'librechat') {
    if (groupsQuery.isLoading || promptsQuery.isLoading) {
      status = <span role="status">{localize('com_ui_loading')}</span>;
    } else if (groupsQuery.isError || promptsQuery.isError) {
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
      reference.version != null &&
      selectedPrompt == null
    ) {
      status = <span role="alert">{localize('com_agents_prompt_missing')}</span>;
    } else if (selectedPrompt?.type != null && selectedPrompt.type !== 'text') {
      status = <span role="alert">{localize('com_agents_prompt_unsupported')}</span>;
    } else if (reference?.source === 'librechat' && prompts.length > 0) {
      status = (
        <span role="status">
          {localize('com_agents_prompt_resolved', { version: reference.version ?? prompts.length })}
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
        validate: (value) => {
          if (source === 'inline') {
            return value?.trim() ? true : localize('com_ui_field_required');
          }
          return reference?.source === source ? true : localize('com_ui_field_required');
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
              <SelectItem value="librechat">
                {localize('com_agents_prompt_source_librechat')}
              </SelectItem>
              <SelectItem value="langfuse">
                {localize('com_agents_prompt_source_langfuse')}
              </SelectItem>
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
              <Select value={groupId} onValueChange={selectGroup}>
                <SelectTrigger aria-label={localize('com_agents_prompt_select')}>
                  <SelectValue placeholder={localize('com_agents_prompt_select')} />
                </SelectTrigger>
                <SelectContent>
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
                disabled={!groupId || prompts.length === 0}
                value={String(reference?.version ?? 'latest')}
                onValueChange={(value) =>
                  reference?.source === 'librechat' &&
                  updateReference({
                    ...reference,
                    version: value === 'latest' ? undefined : Number(value),
                    versionId: value === 'latest' ? undefined : prompts[Number(value) - 1]?._id,
                  })
                }
              >
                <SelectTrigger aria-label={localize('com_agents_prompt_version')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">{localize('com_agents_prompt_latest')}</SelectItem>
                  {prompts.map((prompt, index) => (
                    <SelectItem key={prompt._id ?? index} value={String(index + 1)}>
                      {localize('com_agents_prompt_version_number', { version: index + 1 })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {source === 'langfuse' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                aria-label={localize('com_agents_prompt_name')}
                value={langfuseName}
                placeholder={localize('com_agents_prompt_name')}
                onChange={(event) => updateLangfuse(event.target.value)}
              />
              <div className="flex gap-2">
                <Select
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
                    onChange={(event) => updateLangfuse(langfuseName, Number(event.target.value))}
                  />
                )}
              </div>
            </div>
          )}
          <div className="text-xs text-text-secondary">{status}</div>
          {error && (
            <span
              className="mt-1 text-xs text-text-destructive transition duration-300 ease-in-out"
              role="alert"
            >
              {localize('com_ui_field_required')}
            </span>
          )}
        </div>
      )}
    />
  );
}
