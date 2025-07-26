import React, { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'lucide-react';
import {
  QueryKeys,
  Constants,
  EModelEndpoint,
  PERMISSION_BITS,
  LocalStorageKeys,
  AgentListResponse,
} from 'librechat-data-provider';
import type t from 'librechat-data-provider';
import { OGDialog, OGDialogContent, Button } from '~/components/ui';
import { renderAgentAvatar } from '~/utils/agents';
import { useToast, useLocalize } from '~/hooks';
import { useChatContext } from '~/Providers';

interface SupportContact {
  name?: string;
  email?: string;
}

interface AgentWithSupport extends t.Agent {
  support_contact?: SupportContact;
}
interface AgentDetailProps {
  agent: AgentWithSupport; // The agent data to display
  isOpen: boolean; // Whether the detail dialog is open
  onClose: () => void; // Callback when dialog is closed
}

/**
 * Dialog for displaying agent details
 */
const AgentDetail: React.FC<AgentDetailProps> = ({ agent, isOpen, onClose }) => {
  const localize = useLocalize();
  // const navigate = useNavigate();
  const { conversation, newConversation } = useChatContext();
  const { showToast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  /**
   * Navigate to chat with the selected agent
   */
  const handleStartChat = () => {
    if (agent) {
      const keys = [QueryKeys.agents, { requiredPermission: PERMISSION_BITS.EDIT }];
      const listResp = queryClient.getQueryData<AgentListResponse>(keys);
      if (listResp != null) {
        if (!listResp.data.some((a) => a.id === agent.id)) {
          const currentAgents = [agent, ...JSON.parse(JSON.stringify(listResp.data))];
          queryClient.setQueryData<AgentListResponse>(keys, { ...listResp, data: currentAgents });
        }
      }

      localStorage.setItem(`${LocalStorageKeys.AGENT_ID_PREFIX}0`, agent.id);

      queryClient.setQueryData<t.TMessage[]>(
        [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
        [],
      );
      queryClient.invalidateQueries([QueryKeys.messages]);

      newConversation({
        template: {
          conversationId: Constants.NEW_CONVO as string,
          endpoint: EModelEndpoint.agents,
          agent_id: agent.id,
          title: `Chat with ${agent.name || 'Agent'}`,
        },
      });
    }
  };

  /**
   * Copy the agent's shareable link to clipboard
   */
  const handleCopyLink = () => {
    const baseUrl = new URL(window.location.origin);
    const chatUrl = `${baseUrl.origin}/c/new?agent_id=${agent.id}`;
    navigator.clipboard
      .writeText(chatUrl)
      .then(() => {
        showToast({
          message: localize('com_agents_link_copied'),
        });
      })
      .catch(() => {
        showToast({
          message: localize('com_agents_link_copy_failed'),
        });
      });
  };

  /**
   * Format contact information with mailto links when appropriate
   */
  const formatContact = () => {
    if (!agent?.support_contact) return null;

    const { name, email } = agent.support_contact;

    if (name && email) {
      return (
        <a href={`mailto:${email}`} className="text-primary hover:underline">
          {name}
        </a>
      );
    }

    if (email) {
      return (
        <a href={`mailto:${email}`} className="text-primary hover:underline">
          {email}
        </a>
      );
    }

    if (name) {
      return <span>{name}</span>;
    }

    return null;
  };

  return (
    <OGDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <OGDialogContent
        ref={dialogRef}
        className="max-h-[90vh] overflow-y-auto py-8 sm:max-w-[450px]"
      >
        {/* Copy link button - positioned next to close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-11 top-4 h-4 w-4 rounded-sm p-0 opacity-70 ring-ring-primary ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label={localize('com_agents_copy_link')}
          onClick={handleCopyLink}
          title={localize('com_agents_copy_link')}
        >
          <Link />
        </Button>

        {/* Agent avatar - top center */}
        <div className="mt-6 flex justify-center">{renderAgentAvatar(agent, { size: 'xl' })}</div>

        {/* Agent name - center aligned below image */}
        <div className="mt-3 text-center">
          <h2 className="text-2xl font-bold text-text-primary">
            {agent?.name || localize('com_agents_loading')}
          </h2>
        </div>

        {/* Contact info - center aligned below name */}
        {agent?.support_contact && formatContact() && (
          <div className="mt-1 text-center text-sm text-text-secondary">
            {localize('com_agents_contact')}: {formatContact()}
          </div>
        )}

        {/* Agent description - below contact */}
        <div className="mt-4 whitespace-pre-wrap px-6 text-center text-base text-text-primary">
          {agent?.description || (
            <span className="italic text-text-tertiary">
              {localize('com_agents_no_description')}
            </span>
          )}
        </div>

        {/* Action button */}
        <div className="mb-4 mt-6 flex justify-center">
          <Button className="w-full max-w-xs" onClick={handleStartChat} disabled={!agent}>
            {localize('com_agents_start_chat')}
          </Button>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
};

export default AgentDetail;
