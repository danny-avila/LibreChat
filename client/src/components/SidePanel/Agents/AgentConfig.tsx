import React, { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, useWatch, useFormContext } from 'react-hook-form';
import { QueryKeys, AgentCapabilities, EModelEndpoint, SystemRoles } from 'librechat-data-provider';
import type { TConfig, TPlugin } from 'librechat-data-provider';
import type { AgentForm, AgentPanelProps } from '~/common';
import { cn, defaultTextProps, removeFocusOutlines, getEndpointField, getIconKey } from '~/utils';
import { useCreateAgentMutation, useUpdateAgentMutation } from '~/data-provider';
import { useToastContext, useFileMapContext } from '~/Providers';
import { icons } from '~/components/Chat/Menus/Endpoints/Icons';
import Action from '~/components/SidePanel/Builder/Action';
import { ToolSelectDialog } from '~/components/Tools';
import { useLocalize, useAuthContext } from '~/hooks';
import { processAgentOption } from '~/utils';
import { Spinner } from '~/components/svg';
import DeleteButton from './DeleteButton';
import AgentAvatar from './AgentAvatar';
import FileSearch from './FileSearch';
import ShareAgent from './ShareAgent';
import AgentTool from './AgentTool';
import CodeForm from './Code/Form';
import { Panel } from '~/common';

const labelClass = 'mb-2 text-token-text-primary block font-medium';
const inputClass = cn(
  defaultTextProps,
  'flex w-full px-3 py-2 border-border-light bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring-primary',
  removeFocusOutlines,
);

export default function AgentConfig({
  setAction,
  actions = [],
  agentsConfig,
  endpointsConfig,
  setActivePanel,
  setCurrentAgentId,
}: AgentPanelProps & { agentsConfig?: TConfig | null }) {
  const { user } = useAuthContext();
  const fileMap = useFileMapContext();
  const queryClient = useQueryClient();

  const allTools = queryClient.getQueryData<TPlugin[]>([QueryKeys.tools]) ?? [];
  const { showToast } = useToastContext();
  const localize = useLocalize();

  const [showToolDialog, setShowToolDialog] = useState(false);

  const methods = useFormContext<AgentForm>();

  const { control } = methods;
  const provider = useWatch({ control, name: 'provider' });
  const model = useWatch({ control, name: 'model' });
  const agent = useWatch({ control, name: 'agent' });
  const tools = useWatch({ control, name: 'tools' });
  const agent_id = useWatch({ control, name: 'id' });

  const toolsEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.tools),
    [agentsConfig],
  );
  const actionsEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.actions),
    [agentsConfig],
  );
  const fileSearchEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.file_search) ?? false,
    [agentsConfig],
  );
  const codeEnabled = useMemo(
    () => agentsConfig?.capabilities?.includes(AgentCapabilities.execute_code) ?? false,
    [agentsConfig],
  );

  const knowledge_files = useMemo(() => {
    if (typeof agent === 'string') {
      return [];
    }

    if (agent?.id !== agent_id) {
      return [];
    }

    if (agent.knowledge_files) {
      return agent.knowledge_files;
    }

    const _agent = processAgentOption({
      agent,
      fileMap,
    });
    return _agent.knowledge_files ?? [];
  }, [agent, agent_id, fileMap]);

  const code_files = useMemo(() => {
    if (typeof agent === 'string') {
      return [];
    }

    if (agent?.id !== agent_id) {
      return [];
    }

    if (agent.code_files) {
      return agent.code_files;
    }

    const _agent = processAgentOption({
      agent,
      fileMap,
    });
    return _agent.code_files ?? [];
  }, [agent, agent_id, fileMap]);

  /* Mutations */
  const update = useUpdateAgentMutation({
    onSuccess: (data) => {
      showToast({
        message: `${localize('com_assistants_update_success')} ${
          data.name ?? localize('com_ui_agent')
        }`,
      });
    },
    onError: (err) => {
      const error = err as Error;
      showToast({
        message: `${localize('com_agents_update_error')}${
          error.message ? ` ${localize('com_ui_error')}: ${error.message}` : ''
        }`,
        status: 'error',
      });
    },
  });

  const create = useCreateAgentMutation({
    onSuccess: (data) => {
      setCurrentAgentId(data.id);
      showToast({
        message: `${localize('com_assistants_create_success ')} ${
          data.name ?? localize('com_ui_agent')
        }`,
      });
    },
    onError: (err) => {
      const error = err as Error;
      showToast({
        message: `${localize('com_agents_create_error')}${
          error.message ? ` ${localize('com_ui_error')}: ${error.message}` : ''
        }`,
        status: 'error',
      });
    },
  });

  const handleAddActions = useCallback(() => {
    if (!agent_id) {
      showToast({
        message: localize('com_assistants_actions_disabled'),
        status: 'warning',
      });
      return;
    }
    setActivePanel(Panel.actions);
  }, [agent_id, setActivePanel, showToast, localize]);

  const providerValue = typeof provider === 'string' ? provider : provider?.value;
  let endpointType: EModelEndpoint | undefined;
  let endpointIconURL: string | undefined;
  let iconKey: string | undefined;
  let Icon:
    | React.ComponentType<
        React.SVGProps<SVGSVGElement> & {
          endpoint: string;
          endpointType: EModelEndpoint | undefined;
          iconURL: string | undefined;
        }
      >
    | undefined;

  if (providerValue !== undefined) {
    endpointType = getEndpointField(endpointsConfig, providerValue as string, 'type');
    endpointIconURL = getEndpointField(endpointsConfig, providerValue as string, 'iconURL');
    iconKey = getIconKey({
      endpoint: providerValue as string,
      endpointsConfig,
      endpointType,
      endpointIconURL,
    });
    Icon = icons[iconKey];
  }

  const renderSaveButton = () => {
    if (create.isLoading || update.isLoading) {
      return <Spinner className="icon-md" aria-hidden="true" />;
    }

    if (agent_id) {
      return localize('com_ui_save');
    }

    return localize('com_ui_create');
  };

  return (
    <>
      <div className="h-auto bg-white px-4 pb-8 pt-3 dark:bg-transparent">
        {/* Avatar & Name */}
        <div className="mb-4">
          <AgentAvatar
            createMutation={create}
            agent_id={agent_id}
            avatar={agent?.['avatar'] ?? null}
          />
          <label className={labelClass} htmlFor="name">
            {localize('com_ui_name')}
          </label>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ''}
                maxLength={256}
                className={inputClass}
                id="name"
                type="text"
                placeholder={localize('com_agents_name_placeholder')}
                aria-label="Agent name"
              />
            )}
          />
          <Controller
            name="id"
            control={control}
            render={({ field }) => (
              <p className="h-3 text-xs italic text-text-secondary" aria-live="polite">
                {field.value}
              </p>
            )}
          />
        </div>
        {/* Description */}
        <div className="mb-4">
          <label className={labelClass} htmlFor="description">
            {localize('com_ui_description')}
          </label>
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ''}
                maxLength={512}
                className={inputClass}
                id="description"
                type="text"
                placeholder={localize('com_agents_description_placeholder')}
                aria-label="Agent description"
              />
            )}
          />
        </div>
        {/* Instructions */}
        <div className="mb-6">
          <label className={labelClass} htmlFor="instructions">
            {localize('com_ui_instructions')}
          </label>
          <Controller
            name="instructions"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <>
                <textarea
                  {...field}
                  value={field.value ?? ''}
                  maxLength={32768}
                  className={cn(inputClass, 'min-h-[100px] resize-y')}
                  id="instructions"
                  placeholder={localize('com_agents_instructions_placeholder')}
                  rows={3}
                  aria-label="Agent instructions"
                  aria-required="true"
                  aria-invalid={error ? 'true' : 'false'}
                />
                {error && (
                  <span
                    className="text-sm text-red-500 transition duration-300 ease-in-out"
                    role="alert"
                  >
                    {localize('com_ui_field_required')}
                  </span>
                )}
              </>
            )}
          />
        </div>
        {/* Model and Provider */}
        <div className="mb-6">
          <label className={labelClass} htmlFor="provider">
            {localize('com_ui_model')} <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={() => setActivePanel(Panel.model)}
            className="btn btn-neutral border-token-border-light relative h-10 w-full rounded-lg font-medium"
            aria-haspopup="true"
            aria-expanded="false"
          >
            <div className="flex w-full items-center gap-2">
              {Icon && (
                <div className="shadow-stroke relative flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white text-black dark:bg-white">
                  <Icon
                    className="h-2/3 w-2/3"
                    endpoint={providerValue as string}
                    endpointType={endpointType}
                    iconURL={endpointIconURL}
                  />
                </div>
              )}
              <span>{model != null ? model : localize('com_ui_select_model')}</span>
            </div>
          </button>
        </div>
        {/* Code Execution */}
        {codeEnabled && <CodeForm agent_id={agent_id} files={code_files} />}
        {/* File Search */}
        {fileSearchEnabled && <FileSearch agent_id={agent_id} files={knowledge_files} />}
        {/* Agent Tools & Actions */}
        <div className="mb-6">
          <label className={labelClass}>
            {`${toolsEnabled === true ? localize('com_ui_tools') : ''}
              ${toolsEnabled === true && actionsEnabled === true ? ' + ' : ''}
              ${actionsEnabled === true ? localize('com_assistants_actions') : ''}`}
          </label>
          <div className="space-y-2">
            {tools?.map((func, i) => (
              <AgentTool
                key={`${func}-${i}-${agent_id}`}
                tool={func}
                allTools={allTools}
                agent_id={agent_id}
              />
            ))}
            {actions
              .filter((action) => action.agent_id === agent_id)
              .map((action, i) => (
                <Action
                  key={i}
                  action={action}
                  onClick={() => {
                    setAction(action);
                    setActivePanel(Panel.actions);
                  }}
                />
              ))}
            <div className="flex space-x-2">
              {(toolsEnabled ?? false) && (
                <button
                  type="button"
                  onClick={() => setShowToolDialog(true)}
                  className="btn btn-neutral border-token-border-light relative h-8 w-full rounded-lg font-medium"
                  aria-haspopup="dialog"
                >
                  <div className="flex w-full items-center justify-center gap-2">
                    {localize('com_assistants_add_tools')}
                  </div>
                </button>
              )}
              {(actionsEnabled ?? false) && (
                <button
                  type="button"
                  disabled={!agent_id}
                  onClick={handleAddActions}
                  className="btn btn-neutral border-token-border-light relative h-8 w-full rounded-lg font-medium"
                  aria-haspopup="dialog"
                >
                  <div className="flex w-full items-center justify-center gap-2">
                    {localize('com_assistants_add_actions')}
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
        {/* Context Button */}
        <div className="flex items-center justify-end gap-2">
          <DeleteButton
            agent_id={agent_id}
            setCurrentAgentId={setCurrentAgentId}
            createMutation={create}
          />
          {(agent?.author === user?.id || user?.role === SystemRoles.ADMIN) && (
            <ShareAgent
              agent_id={agent_id}
              agentName={agent?.name ?? ''}
              projectIds={agent?.projectIds ?? []}
              isCollaborative={agent?.isCollaborative}
            />
          )}
          {/* Submit Button */}
          <button
            className="btn btn-primary focus:shadow-outline flex w-full items-center justify-center px-4 py-2 font-semibold text-white hover:bg-green-600 focus:border-green-500"
            type="submit"
            disabled={create.isLoading || update.isLoading}
            aria-busy={create.isLoading || update.isLoading}
          >
            {renderSaveButton()}
          </button>
        </div>
      </div>
      <ToolSelectDialog
        isOpen={showToolDialog}
        setIsOpen={setShowToolDialog}
        toolsFormKey="tools"
        endpoint={EModelEndpoint.agents}
      />
    </>
  );
}
