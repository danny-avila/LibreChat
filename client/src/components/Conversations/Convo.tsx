import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import { useToastContext, useMediaQuery } from '@librechat/client';
import type { TConversation } from 'librechat-data-provider';
import { useUpdateConversationMutation } from '~/data-provider';
import EndpointIcon from '~/components/Endpoints/EndpointIcon';
import { useNavigateToConvo, useLocalize } from '~/hooks';
import { useGetEndpointsQuery } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { ConvoOptions } from './ConvoOptions';
import RenameForm from './RenameForm';
import ConvoLink from './ConvoLink';
import { useBulkSelect } from './BulkSelectContext';
import { cn } from '~/utils';
import store from '~/store';

interface ConversationProps {
  conversation: TConversation;
  retainView: () => void;
  toggleNav: () => void;
  isLatestConvo: boolean;
}

export default function Conversation({
  conversation,
  retainView,
  toggleNav,
  isLatestConvo,
}: ConversationProps) {
  const params = useParams();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { navigateToConvo } = useNavigateToConvo();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const currentConvoId = useMemo(() => params.conversationId, [params.conversationId]);
  const updateConvoMutation = useUpdateConversationMutation(currentConvoId ?? '');
  const activeConvos = useRecoilValue(store.allConversationsSelector);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { conversationId, title = '' } = conversation;
  const { isSelectionMode, isSelected, toggleConversation } = useBulkSelect();

  const [titleInput, setTitleInput] = useState(title || '');
  const [renaming, setRenaming] = useState(false);
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  const previousTitle = useRef(title);

  useEffect(() => {
    if (title !== previousTitle.current) {
      setTitleInput(title as string);
      previousTitle.current = title;
    }
  }, [title]);

  const isActiveConvo = useMemo(() => {
    if (conversationId === Constants.NEW_CONVO) {
      return currentConvoId === Constants.NEW_CONVO;
    }

    if (currentConvoId !== Constants.NEW_CONVO) {
      return currentConvoId === conversationId;
    } else {
      const latestConvo = activeConvos?.[0];
      return latestConvo === conversationId;
    }
  }, [currentConvoId, conversationId, activeConvos]);

  const handleRename = () => {
    setIsPopoverActive(false);
    setTitleInput(title as string);
    setRenaming(true);
  };

  const handleRenameSubmit = async (newTitle: string) => {
    if (!conversationId || newTitle === title) {
      setRenaming(false);
      return;
    }

    try {
      await updateConvoMutation.mutateAsync({
        conversationId,
        title: newTitle.trim() || localize('com_ui_untitled'),
      });
      setRenaming(false);
    } catch (error) {
      setTitleInput(title as string);
      showToast({
        message: localize('com_ui_rename_failed'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
      setRenaming(false);
    }
  };

  const handleCancelRename = () => {
    setTitleInput(title as string);
    setRenaming(false);
  };

  const handleNavigation = (ctrlOrMetaKey: boolean) => {
    if (isSelectionMode) {
      return;
    }

    if (ctrlOrMetaKey) {
      toggleNav();
      const baseUrl = window.location.origin;
      const path = `/c/${conversationId}`;
      window.open(baseUrl + path, '_blank');
      return;
    }

    if (currentConvoId === conversationId || isPopoverActive) {
      return;
    }

    toggleNav();

    if (typeof title === 'string' && title.length > 0) {
      document.title = title;
    }

    navigateToConvo(conversation, {
      currentConvoId,
      resetLatestMessage: !(conversationId ?? '') || conversationId === Constants.NEW_CONVO,
    });
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (conversationId) {
      toggleConversation(conversationId);
    }
  };

  const convoOptionsProps = {
    title,
    retainView,
    renameHandler: handleRename,
    isActiveConvo,
    conversationId,
    isPopoverActive,
    setIsPopoverActive,
  };

  const isConversationSelected = isSelected(conversationId || '');
  const showCheckbox = isConversationSelected;

  return (
    <div
      className={cn(
        'group relative flex h-12 w-full items-center rounded-lg transition-colors duration-200 md:h-9',
        isActiveConvo ? 'bg-surface-active-alt' : 'hover:bg-surface-active-alt',
        isConversationSelected && 'bg-surface-active-alt ring-1 ring-border-medium',
      )}
      role="listitem"
      tabIndex={0}
      onClick={(e) => {
        if (renaming) {
          return;
        }
        if (e.button === 0) {
          handleNavigation(e.ctrlKey || e.metaKey);
        }
      }}
      onKeyDown={(e) => {
        if (renaming) {
          return;
        }
        if (e.key === 'Enter') {
          handleNavigation(false);
        }
      }}
      style={{ cursor: renaming ? 'default' : 'pointer' }}
      data-testid="convo-item"
    >
      {/* Checkbox overlay - positioned absolutely to not affect layout */}
      <div 
        className={cn(
          "absolute left-2 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center shadow-md transition-opacity duration-200",
          showCheckbox || isSelectionMode
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100"
        )}
      >
        <input
          type="checkbox"
          checked={isConversationSelected}
          onChange={() => {}}
          onClick={handleCheckboxClick}
          className="h-4 w-4 cursor-pointer rounded border-2 border-border-medium text-blue-600 focus:ring-2 focus:ring-blue-500 hover:border-blue-400"
          aria-label={localize('com_ui_select_conversation')}
        />
      </div>
      
      {renaming ? (
        <RenameForm
          titleInput={titleInput}
          setTitleInput={setTitleInput}
          onSubmit={handleRenameSubmit}
          onCancel={handleCancelRename}
          localize={localize}
        />
      ) : (
        <div className="flex flex-1 items-center">
          <ConvoLink
            isActiveConvo={isActiveConvo}
            title={title}
            onRename={handleRename}
            isSmallScreen={isSmallScreen}
            localize={localize}
          >
            <EndpointIcon
              conversation={conversation}
              endpointsConfig={endpointsConfig}
              size={20}
              context="menu-item"
            />
          </ConvoLink>
        </div>
      )}
      <div
        className={cn(
          'mr-2 flex origin-left',
          isSelectionMode ? 'pointer-events-none max-w-0 scale-x-0 opacity-0' :
          isPopoverActive || isActiveConvo
            ? 'pointer-events-auto max-w-[28px] scale-x-100 opacity-100'
            : 'pointer-events-none max-w-0 scale-x-0 opacity-0 group-focus-within:pointer-events-auto group-focus-within:max-w-[28px] group-focus-within:scale-x-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:max-w-[28px] group-hover:scale-x-100 group-hover:opacity-100',
        )}
        aria-hidden={!(isPopoverActive || isActiveConvo) || isSelectionMode}
      >
        {!renaming && !isSelectionMode && <ConvoOptions {...convoOptionsProps} />}
      </div>
    </div>
  );
}
