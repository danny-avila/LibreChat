import { EarthIcon } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { AgentCapabilities, defaultAgentFormValues } from 'librechat-data-provider';
import type { UseMutationResult, QueryObserverResult } from '@tanstack/react-query';
import type { Agent, AgentCreateParams } from 'librechat-data-provider';
import type { UseFormReset } from 'react-hook-form';
import type { TAgentCapabilities, AgentForm, TAgentOption } from '~/common';
import { useListAgentsQuery, useGetStartupConfig } from '~/data-provider';
import { cn, createProviderOption, processAgentOption } from '~/utils';
import ControlCombobox from '~/components/ui/ControlCombobox';
import { useLocalize } from '~/hooks';

const keys = new Set(Object.keys(defaultAgentFormValues));

export default function AgentSelect({
  reset,
  agentQuery,
  value: currentAgentValue,
  selectedAgentId = null,
  setCurrentAgentId,
  createMutation,
}: {
  reset: UseFormReset<AgentForm>;
  value?: TAgentOption;
  selectedAgentId: string | null;
  agentQuery: QueryObserverResult<Agent>;
  setCurrentAgentId: React.Dispatch<React.SetStateAction<string | undefined>>;
  createMutation: UseMutationResult<Agent, Error, AgentCreateParams>;
}) {
  const localize = useLocalize();
  const lastSelectedAgent = useRef<string | null>(null);

  const { data: startupConfig } = useGetStartupConfig();
  const { data: agents = null } = useListAgentsQuery(undefined, {
    select: (res) =>
      res.data.map((agent) =>
        processAgentOption({
          agent,
          instanceProjectId: startupConfig?.instanceProjectId,
        }),
      ),
  });

  const resetAgentForm = useCallback(
    (fullAgent: Agent) => {
      const { instanceProjectId } = startupConfig ?? {};
      const isGlobal =
        (instanceProjectId != null && fullAgent.projectIds?.includes(instanceProjectId)) ?? false;
      const update = {
        ...fullAgent,
        provider: createProviderOption(fullAgent.provider),
        label: fullAgent.name ?? '',
        value: fullAgent.id || '',
        icon: isGlobal ? <EarthIcon className={'icon-lg text-green-400'} /> : null,
      };

      const capabilities: TAgentCapabilities = {
        [AgentCapabilities.file_search]: false,
        [AgentCapabilities.execute_code]: false,
        [AgentCapabilities.end_after_tools]: false,
        [AgentCapabilities.hide_sequential_outputs]: false,
      };

      const agentTools: string[] = [];
      (fullAgent.tools ?? []).forEach((tool) => {
        if (capabilities[tool] !== undefined) {
          capabilities[tool] = true;
          return;
        }

        agentTools.push(tool);
      });

      const formValues: Partial<AgentForm & TAgentCapabilities> = {
        ...capabilities,
        agent: update,
        model: update.model,
        tools: agentTools,
      };

      Object.entries(fullAgent).forEach(([name, value]) => {
        if (name === 'model_parameters') {
          formValues[name] = value;
          return;
        }

        if (!keys.has(name)) {
          return;
        }

        if (typeof value !== 'number' && typeof value !== 'object') {
          formValues[name] = value;
        }
      });

      reset(formValues);
    },
    [reset, startupConfig],
  );

  const onSelect = useCallback(
    (selectedId: string) => {
      const agentExists = !!(selectedId
        ? (agents ?? []).find((agent) => agent.id === selectedId)
        : undefined);

      createMutation.reset();
      if (!agentExists) {
        setCurrentAgentId(undefined);
        return reset({
          ...defaultAgentFormValues,
        });
      }

      setCurrentAgentId(selectedId);
      const agent = agentQuery.data;
      if (!agent) {
        console.warn('Agent not found');
        return;
      }

      resetAgentForm(agent);
    },
    [agents, createMutation, setCurrentAgentId, agentQuery.data, resetAgentForm, reset],
  );

  useEffect(() => {
    if (agentQuery.data && agentQuery.isSuccess) {
      resetAgentForm(agentQuery.data);
    }
  }, [agentQuery.data, agentQuery.isSuccess, resetAgentForm]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;

    if (selectedAgentId === lastSelectedAgent.current) {
      return;
    }

    if (selectedAgentId != null && selectedAgentId !== '' && agents) {
      timerId = setTimeout(() => {
        lastSelectedAgent.current = selectedAgentId;
        onSelect(selectedAgentId);
      }, 5);
    }

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [selectedAgentId, agents, onSelect]);

  const createAgent = localize('com_ui_create') + ' ' + localize('com_ui_agent');

  return (
    <ControlCombobox
      containerClassName="px-0"
      selectedValue={(currentAgentValue?.value ?? '') + ''}
      displayValue={currentAgentValue?.label ?? ''}
      selectPlaceholder={createAgent}
      iconSide="right"
      searchPlaceholder={localize('com_agents_search_name')}
      SelectIcon={currentAgentValue?.icon}
      setValue={onSelect}
      items={
        agents?.map((agent) => ({
          label: agent.name ?? '',
          value: agent.id ?? '',
          icon: agent.icon,
        })) ?? [
          {
            label: 'Loading...',
            value: '',
          },
        ]
      }
      className={cn(
        'z-50 flex h-[40px] w-full flex-none items-center justify-center truncate rounded-md bg-transparent font-bold',
      )}
      ariaLabel={localize('com_ui_agent')}
      isCollapsed={false}
      showCarat={true}
    />
  );
}
