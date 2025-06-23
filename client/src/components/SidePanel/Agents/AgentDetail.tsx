import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, Button, DotsIcon, DialogContent, useToastContext } from '@librechat/client';
import type t from 'librechat-data-provider';
import { renderAgentAvatar } from '~/utils';
import { useLocalize } from '~/hooks';

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
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const dialogRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Close dropdown when clicking outside the dropdown menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  /**
   * Navigate to chat with the selected agent
   */
  const handleStartChat = () => {
    if (agent) {
      navigate(`/c/new?agent_id=${agent.id}`);
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
          message: 'Link copied',
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent ref={dialogRef} className="max-h-[90vh] overflow-y-auto py-8 sm:max-w-[450px]">
        {/* Context menu - top right */}
        <div ref={dropdownRef} className="absolute right-12 top-5 z-50">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-text-secondary hover:bg-surface-hover hover:text-text-primary dark:hover:bg-surface-hover"
            aria-label="More options"
            aria-expanded={dropdownOpen}
            aria-haspopup="menu"
            onClick={(e) => {
              e.stopPropagation();
              setDropdownOpen(!dropdownOpen);
            }}
          >
            <DotsIcon className="h-4 w-4" />
          </Button>

          {/* Simple dropdown menu */}
          {dropdownOpen && (
            <div className="absolute right-0 top-10 z-[9999] w-48 rounded-xl border border-border-light bg-surface-primary py-1 shadow-lg dark:bg-surface-secondary dark:shadow-2xl">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen(false);
                  handleCopyLink();
                }}
                className="w-full px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
              >
                {localize('com_agents_copy_link')}
              </button>
            </div>
          )}
        </div>

        {/* Agent avatar - top center */}
        <div className="mt-6 flex justify-center">{renderAgentAvatar(agent, { size: 'xl' })}</div>

        {/* Agent name - center aligned below image */}
        <div className="mt-3 text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {agent?.name || localize('com_agents_loading')}
          </h2>
        </div>

        {/* Contact info - center aligned below name */}
        {agent?.support_contact && formatContact() && (
          <div className="mt-1 text-center text-sm text-gray-600 dark:text-gray-400">
            {localize('com_agents_contact')}: {formatContact()}
          </div>
        )}

        {/* Agent description - below contact */}
        <div className="mt-4 whitespace-pre-wrap px-6 text-center text-base text-gray-700 dark:text-gray-300">
          {agent?.description || (
            <span className="italic text-gray-400">{localize('com_agents_no_description')}</span>
          )}
        </div>

        {/* Action button */}
        <div className="mb-4 mt-6 flex justify-center">
          <Button className="w-full max-w-xs" onClick={handleStartChat} disabled={!agent}>
            {localize('com_agents_start_chat')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AgentDetail;
