import React from 'react';
import * as Ariakit from '@ariakit/react';
import { Agent } from 'librechat-data-provider';
import { useFormContext } from 'react-hook-form';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { CopyPlus, MoreHorizontal, Trash } from 'lucide-react';
import { DropdownPopup, useToastContext } from '@librechat/client';
import { useDeleteAgentMutation, useDuplicateAgentMutation } from '~/data-provider';
import { logAgentDuplication } from '~/nj/analytics/logHelpers';
import { getDefaultAgentFormValues, logger } from '~/utils';
import { AgentPanelProps, MenuItemProps } from '~/common';
import { useLocalize } from '~/hooks';
import store from '~/store';

/**
 * Dropdown that lets you duplicate/delete an agent.
 *
 * Much of the logic used here is borrowed from the original implementations in AgentFooter (and
 * child components DuplicateAgent and DeleteButton).
 */
export default function ManageAgentDropdown({
  agent,
  setCurrentAgentId,
  createMutation,
}: Pick<AgentPanelProps, 'setCurrentAgentId' | 'createMutation'> & {
  agent?: Agent;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { reset } = useFormContext();
  const setConversation = useSetRecoilState(store.conversationByIndex(0));
  const conversationAgentId = useRecoilValue(store.conversationAgentIdByIndex(0));

  const [manageMenuIsOpen, setManageMenuIsOpen] = React.useState(false);

  const duplicateAgent = useDuplicateAgentMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_agent_duplicated'),
        status: 'success',
      });
    },
    onError: (error) => {
      console.error(error);
      showToast({
        message: localize('com_ui_agent_duplicate_error'),
        status: 'error',
      });
    },
  });

  const deleteAgent = useDeleteAgentMutation({
    onSuccess: (_, vars, context) => {
      const updatedList = context as Agent[] | undefined;
      if (!updatedList) {
        return;
      }

      showToast({
        message: localize('com_ui_agent_deleted'),
        status: 'success',
      });

      if (createMutation.data?.id ?? '') {
        logger.log('agents', 'resetting createMutation');
        createMutation.reset();
      }

      const firstAgent = updatedList[0] as Agent | undefined;
      if (!firstAgent) {
        setCurrentAgentId(undefined);
        reset(getDefaultAgentFormValues());
        setConversation((prev) => (prev ? { ...prev, agent_id: '' } : prev));
        return;
      }

      if (vars.agent_id === conversationAgentId) {
        setConversation((prev) => (prev ? { ...prev, model: '', agent_id: firstAgent.id } : prev));
        return;
      }

      const currentAgent = updatedList.find((agent) => agent.id === conversationAgentId);
      setCurrentAgentId(currentAgent?.id ?? firstAgent.id);
    },
    onError: (error) => {
      console.error(error);
      showToast({
        message: localize('com_ui_agent_delete_error'),
        status: 'error',
      });
    },
  });

  const dropdownItems: MenuItemProps[] = [
    {
      label: localize('com_ui_duplicate'),
      onClick: () => {
        if (agent?.id) {
          logAgentDuplication(agent.id);
          duplicateAgent.mutate({ agent_id: agent.id });
        }
      },
      icon: <CopyPlus className="size-4" />,
    },
    {
      label: localize('com_ui_delete'),
      onClick: () => {
        if (agent?.id) {
          deleteAgent.mutate({ agent_id: agent.id });
        }
      },
      icon: <Trash className="size-4 text-red-500" />,
    },
  ];

  return (
    <DropdownPopup
      menuId="manage-agent-menu"
      isOpen={manageMenuIsOpen}
      setIsOpen={setManageMenuIsOpen}
      trigger={
        <Ariakit.MenuButton
          aria-label={`Manage agent "${agent?.name}"`}
          className="flex items-center gap-1 rounded px-2 py-2 text-sm transition-colors hover:bg-surface-active-alt"
        >
          <MoreHorizontal className="h-4 w-4 text-text-secondary" aria-hidden="true" />
          <span className="text-sm font-semibold">{localize('com_ui_manage')}</span>
        </Ariakit.MenuButton>
      }
      items={dropdownItems}
    />
  );
}
