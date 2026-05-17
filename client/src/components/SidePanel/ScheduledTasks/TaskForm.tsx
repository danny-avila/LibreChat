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
  EModelEndpoint,
  isAssistantsEndpoint,
} from 'librechat-data-provider';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import type { TScheduledTask } from 'librechat-data-provider';
import {
  useGetEndpointsQuery,
  useCreateScheduledTask,
  useUpdateScheduledTask,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import {
  buildInitialTask,
  formStateToCreatePayload,
  isValidCronExpression,
  taskToFormState,
} from './helpers';
import type { ScheduledTaskFormState } from './helpers';
import { CRON_PRESETS, describeCronExpression } from './cronPresets';
import { getSupportedTimezones } from './timezones';
import MCPServerPicker from './MCPServerPicker';

interface TaskFormProps {
  task?: TScheduledTask;
  onSubmitted?: (taskId: string) => void;
}

/**
 * Full-page Scheduled Tasks builder, mirroring the prompt-builder layout. The
 * form covers a single goal: schedule an ephemeral agent run by picking a
 * provider, model, cron schedule, prompt, and optional capabilities/MCPs.
 */
export default function TaskForm({ task, onSubmitted }: TaskFormProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const createMutation = useCreateScheduledTask();
  const updateMutation = useUpdateScheduledTask();
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  const { data: modelsData = {} } = useGetModelsQuery();

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

  const canSubmit =
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">
            {task
              ? localize('com_sidepanel_edit_task')
              : localize('com_sidepanel_new_task')}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {localize('com_sidepanel_task_form_intro')}
          </p>
        </div>
      </header>

      <section className="flex flex-col gap-4 rounded-lg border border-border-light bg-surface-primary p-4">
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
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border-light bg-surface-primary p-4">
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
          />
          <SelectDropDown
            value=""
            setValue={(value) => {
              if (typeof value === 'string' && value) {
                setState((prev) => ({ ...prev, expression: value }));
              }
            }}
            availableValues={[
              { label: localize('com_sidepanel_cron_preset_placeholder'), value: '' },
              ...CRON_PRESETS.map((preset) => ({
                label: localize(preset.labelKey) || preset.label,
                value: preset.value,
              })),
            ]}
            showAbove={false}
            showLabel={false}
            className="w-full"
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
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border-light bg-surface-primary p-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-primary" htmlFor="task-prompt">
            {localize('com_sidepanel_prompt')} <span className="text-red-500">*</span>
          </label>
          <TextareaAutosize
            id="task-prompt"
            value={state.payload.text ?? ''}
            onChange={(e) =>
              setState((prev) => ({
                ...prev,
                payload: { ...prev.payload, text: e.target.value },
              }))
            }
            className="w-full rounded-md border border-border-light bg-surface-primary p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring-primary"
            minRows={3}
            placeholder={localize('com_sidepanel_prompt_placeholder')}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-border-light bg-surface-primary p-4">
        <span className="text-sm font-medium text-text-primary">
          {localize('com_assistants_capabilities')}
        </span>
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
        <div className="mt-2 border-t border-border-light pt-3">
          <MCPServerPicker
            value={state.payload.ephemeralAgent?.mcp ?? []}
            onChange={(mcp) => updateEphemeralAgent({ mcp })}
          />
        </div>
      </section>

      <section className="flex items-center gap-2 rounded-lg border border-border-light bg-surface-primary p-4">
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
  );
}
