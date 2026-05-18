import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Switch,
  Checkbox,
  ControlCombobox,
  SelectDropDown,
  TextareaAutosize,
} from '@librechat/client';
import {
  alternateName,
  Permissions,
  EModelEndpoint,
  PermissionTypes,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import type { TScheduledTask } from 'librechat-data-provider';
import type { ScheduledTaskFormState } from './helpers';
import {
  useGetEndpointsQuery,
  useCreateScheduledTask,
  useUpdateScheduledTask,
} from '~/data-provider';
import {
  useLocalize,
  useHasAccess,
  useGetAgentsConfig,
  useAgentCapabilities,
} from '~/hooks';
import {
  buildInitialTask,
  formStateToCreatePayload,
  isValidCronExpression,
  taskToFormState,
} from './helpers';
import { describeCronExpression } from './cronPresets';
import { getSupportedTimezones } from './timezones';
import MCPServerPicker from './MCPServerPicker';
import { cn } from '~/utils';

interface TaskFormProps {
  task?: TScheduledTask;
  onSubmitted?: (taskId: string) => void;
}

/**
 * Full-page Scheduled Tasks builder. The form covers a single goal: schedule
 * an ephemeral agent run by picking a provider, model, cron schedule,
 * prompt, and optional capabilities/MCPs.
 */
export default function TaskForm({ task, onSubmitted }: TaskFormProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const createMutation = useCreateScheduledTask();
  const updateMutation = useUpdateScheduledTask();
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  const { data: modelsData = {} } = useGetModelsQuery();
  const { agentsConfig } = useGetAgentsConfig({ endpointsConfig });
  const { skillsEnabled } = useAgentCapabilities(agentsConfig?.capabilities);
  const canUseSkills = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });
  const showSkillsToggle = canUseSkills && skillsEnabled;

  const [state, setState] = useState<ScheduledTaskFormState>(() =>
    task ? taskToFormState(task) : buildInitialTask(),
  );

  useEffect(() => {
    if (task) {
      setState(taskToFormState(task));
    }
  }, [task]);

  const providers = useMemo(
    () =>
      Object.keys(endpointsConfig ?? {}).filter(
        (key) =>
          !isAssistantsEndpoint(key) &&
          key !== EModelEndpoint.agents &&
          endpointsConfig?.[key] != null,
      ),
    [endpointsConfig],
  );

  const models = useMemo(() => {
    if (!state.endpoint) return [];
    return modelsData[state.endpoint] ?? [];
  }, [modelsData, state.endpoint]);

  useEffect(() => {
    if (!state.endpoint || !state.model) {
      return;
    }
    if (!models.includes(state.model)) {
      setState((prev) => ({ ...prev, model: models[0] ?? '' }));
    }
  }, [state.endpoint, state.model, models]);

  const timezoneOptions = useMemo(
    () => getSupportedTimezones().map((tz) => ({ label: tz, value: tz })),
    [],
  );

  const cronValid = useMemo(() => isValidCronExpression(state.expression), [state.expression]);
  const cronDescription = useMemo(() => describeCronExpression(state.expression), [state.expression]);

  const trimmedName = state.name.trim();
  const nameValid = trimmedName.length > 0 && trimmedName.length <= 120;

  const canSubmit =
    nameValid &&
    cronValid &&
    state.endpoint.length > 0 &&
    state.model.length > 0 &&
    (state.payload.text ?? '').trim().length > 0;

  const isSubmitting = createMutation.isLoading || updateMutation.isLoading;

  const handleCancel = () => {
    navigate(-1);
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const payload = formStateToCreatePayload(state);
    if (task) {
      updateMutation.mutate(
        { id: task._id, payload },
        {
          onSuccess: (updated) => {
            onSubmitted?.(updated._id);
            navigate(`/scheduled-tasks/${updated._id}`, { replace: true });
          },
        },
      );
      return;
    }
    createMutation.mutate(payload, {
      onSuccess: (created) => {
        onSubmitted?.(created._id);
        navigate(`/scheduled-tasks/${created._id}`, { replace: true });
      },
    });
  };

  const updateEphemeralAgent = (
    patch: Partial<NonNullable<ScheduledTaskFormState['payload']['ephemeralAgent']>>,
  ) => {
    setState((prev) => ({
      ...prev,
      payload: {
        ...prev.payload,
        ephemeralAgent: { ...prev.payload.ephemeralAgent, ...patch },
      },
    }));
  };

  return (
    <div className="w-full px-4 py-2">
      <h1 className="sr-only">
        {task ? localize('com_sidepanel_edit_task') : localize('com_sidepanel_new_task')}
      </h1>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">
            {task
              ? localize('com_sidepanel_edit_task')
              : localize('com_sidepanel_new_task')}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {localize('com_sidepanel_task_form_intro')}
          </p>
        </div>
      </header>

      <div className="flex w-full flex-col gap-4">
        <section className="rounded-xl border border-border-medium bg-transparent">
          <header className="flex items-center justify-between rounded-t-xl border-b border-border-medium p-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {localize('com_sidepanel_task_name')} <span className="text-red-500">*</span>
            </h3>
          </header>
          <div className="p-4">
            <Input
              id="task-name"
              type="text"
              value={state.name}
              onChange={(e) => setState((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={localize('com_sidepanel_task_name_placeholder')}
              aria-invalid={!nameValid && state.name.length > 0}
              maxLength={120}
              className={cn(
                'w-full border border-border-medium bg-transparent p-2 text-sm text-text-primary',
                !nameValid && state.name.length > 0 && 'border-red-500 focus-visible:ring-red-500',
              )}
            />
            {!nameValid && state.name.length > 0 && (
              <span className="mt-1 block text-xs text-red-500">
                {localize('com_sidepanel_task_name_invalid')}
              </span>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border-medium bg-transparent">
          <header className="flex items-center justify-between rounded-t-xl border-b border-border-medium p-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {localize('com_sidepanel_target_section')}
            </h3>
          </header>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary" htmlFor="task-provider">
                {localize('com_ui_provider')} <span className="text-red-500">*</span>
              </label>
              <ControlCombobox
                ariaLabel={localize('com_ui_provider')}
                selectedValue={state.endpoint}
                displayValue={alternateName[state.endpoint] ?? state.endpoint}
                selectPlaceholder={localize('com_ui_select_provider')}
                searchPlaceholder={localize('com_ui_select_search_provider')}
                setValue={(value: string) =>
                  setState((prev) => ({ ...prev, endpoint: value, model: '' }))
                }
                items={providers.map((provider) => ({
                  label: alternateName[provider] ?? provider,
                  value: provider,
                }))}
                isCollapsed={false}
                showCarat={true}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary" htmlFor="task-model">
                {localize('com_ui_model')} <span className="text-red-500">*</span>
              </label>
              <ControlCombobox
                ariaLabel={localize('com_ui_model')}
                selectedValue={state.model}
                selectPlaceholder={
                  state.endpoint
                    ? localize('com_ui_select_model')
                    : localize('com_ui_select_provider_first')
                }
                searchPlaceholder={localize('com_ui_select_model')}
                setValue={(value: string) => setState((prev) => ({ ...prev, model: value }))}
                items={models.map((model) => ({ label: model, value: model }))}
                disabled={!state.endpoint}
                isCollapsed={false}
                showCarat={true}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border-medium bg-transparent">
          <header className="flex items-center justify-between rounded-t-xl border-b border-border-medium p-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {localize('com_sidepanel_schedule_section')}
            </h3>
          </header>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary" htmlFor="task-cron">
                {localize('com_sidepanel_cron_expression')} <span className="text-red-500">*</span>
              </label>
              <Input
                id="task-cron"
                type="text"
                value={state.expression}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, expression: e.target.value }))
                }
                placeholder="0 * * * *"
                aria-invalid={!cronValid}
                className={cn(
                  'w-full border border-border-medium bg-transparent p-2 font-mono text-sm text-text-primary',
                  !cronValid && 'border-red-500 focus-visible:ring-red-500',
                )}
              />
              {cronValid ? (
                cronDescription && (
                  <span className="text-xs text-text-secondary">{cronDescription}</span>
                )
              ) : (
                <span className="text-xs text-red-500">
                  {localize('com_sidepanel_cron_invalid')}
                </span>
              )}
              <a
                href="https://crontab.guru/"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-text-secondary underline-offset-2 hover:underline"
              >
                {localize('com_sidepanel_cron_help')}
              </a>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary" htmlFor="task-timezone">
                {localize('com_sidepanel_timezone')}
              </label>
              <SelectDropDown
                value={state.timezone}
                setValue={(value) =>
                  setState((prev) => ({ ...prev, timezone: value as string }))
                }
                availableValues={timezoneOptions}
                showAbove={false}
                showLabel={false}
                className="w-full"
              />
              <span className="text-xs text-text-secondary">
                {localize('com_sidepanel_timezone_hint')}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border-medium bg-transparent">
          <header className="flex items-center justify-between rounded-t-xl border-b border-border-medium p-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {localize('com_sidepanel_prompt')} <span className="text-red-500">*</span>
            </h3>
          </header>
          <div className="p-4">
            <TextareaAutosize
              id="task-prompt"
              value={state.payload.text ?? ''}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  payload: { ...prev.payload, text: e.target.value },
                }))
              }
              className="w-full resize-none overflow-y-auto bg-transparent text-sm leading-relaxed text-text-primary placeholder:text-text-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              minRows={4}
              maxRows={16}
              placeholder={localize('com_sidepanel_prompt_placeholder')}
              aria-label={localize('com_sidepanel_prompt')}
            />
          </div>
        </section>

        <section className="rounded-xl border border-border-medium bg-transparent">
          <header className="flex items-center justify-between rounded-t-xl border-b border-border-medium p-3">
            <h3 className="text-sm font-semibold text-text-primary">
              {localize('com_assistants_capabilities')}
            </h3>
          </header>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between">
              <label htmlFor="web_search" className="text-sm text-text-primary">
                {localize('com_ui_tool_name_web_search')}
              </label>
              <Switch
                id="web_search"
                checked={state.payload.ephemeralAgent?.web_search === true}
                onCheckedChange={(checked) => updateEphemeralAgent({ web_search: !!checked })}
                aria-label={localize('com_ui_tool_name_web_search')}
              />
            </div>
            <div className="flex items-center justify-between">
              <label htmlFor="file_search" className="text-sm text-text-primary">
                {localize('com_ui_tool_name_file_search')}
              </label>
              <Switch
                id="file_search"
                checked={state.payload.ephemeralAgent?.file_search === true}
                onCheckedChange={(checked) => updateEphemeralAgent({ file_search: !!checked })}
                aria-label={localize('com_ui_tool_name_file_search')}
              />
            </div>
            <div className="flex items-center justify-between">
              <label htmlFor="execute_code" className="text-sm text-text-primary">
                {localize('com_ui_tool_name_code')}
              </label>
              <Switch
                id="execute_code"
                checked={state.payload.ephemeralAgent?.execute_code === true}
                onCheckedChange={(checked) => updateEphemeralAgent({ execute_code: !!checked })}
                aria-label={localize('com_ui_tool_name_code')}
              />
            </div>
            {showSkillsToggle && (
              <div className="flex items-center justify-between">
                <label htmlFor="skills" className="text-sm text-text-primary">
                  {localize('com_ui_skills')}
                </label>
                <Switch
                  id="skills"
                  checked={state.payload.ephemeralAgent?.skills === true}
                  onCheckedChange={(checked) => updateEphemeralAgent({ skills: !!checked })}
                  aria-label={localize('com_ui_skills')}
                />
              </div>
            )}
            <div className="border-t border-border-medium pt-3">
              <MCPServerPicker
                value={state.payload.ephemeralAgent?.mcp ?? []}
                onChange={(mcp) => updateEphemeralAgent({ mcp })}
              />
            </div>
          </div>
        </section>

        <section className="flex items-center gap-2 rounded-xl border border-border-medium bg-transparent p-4">
          <Checkbox
            id="isTemporary"
            checked={state.payload.isTemporary === true}
            onCheckedChange={(checked) =>
              setState((prev) => ({
                ...prev,
                payload: { ...prev.payload, isTemporary: checked === true },
              }))
            }
            aria-label={localize('com_sidepanel_temporary_chat')}
          />
          <label htmlFor="isTemporary" className="text-sm text-text-primary">
            {localize('com_sidepanel_temporary_chat')}
          </label>
        </section>

        <div className="flex items-center justify-end gap-2 pb-6">
          <Button variant="outline" onClick={handleCancel}>
            {localize('com_ui_cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
            {isSubmitting ? localize('com_ui_saving') : localize('com_ui_save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
