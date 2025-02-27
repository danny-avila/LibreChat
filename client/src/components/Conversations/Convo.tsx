import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { Check, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import type { MouseEvent, FocusEvent, KeyboardEvent } from 'react';
import type { TConversation } from 'librechat-data-provider';
import { useNavigateToConvo, useMediaQuery, useLocalize } from '~/hooks';
import { useUpdateConversationMutation } from '~/data-provider';
import EndpointIcon from '~/components/Endpoints/EndpointIcon';
import { useGetEndpointsQuery } from '~/data-provider';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import { ConvoOptions } from './ConvoOptions';
import { cn } from '~/utils';
import store from '~/store';

type KeyEvent = KeyboardEvent<HTMLInputElement>;

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
  const { conversationId, title = '' } = conversation;

  const params = useParams();
  const currentConvoId = params.conversationId;
  const updateConvoMutation = useUpdateConversationMutation(currentConvoId ?? '');
  const activeConvos = useRecoilValue(store.allConversationsSelector);
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { navigateWithLastTools } = useNavigateToConvo();
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const [titleInput, setTitleInput] = useState(title || '');
  const [renaming, setRenaming] = useState(false);
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const previousTitle = useRef(title);

  const isActiveConvo = useMemo(
    () =>
      currentConvoId === conversationId ||
      (isLatestConvo &&
        currentConvoId === 'new' &&
        activeConvos[0] != null &&
        activeConvos[0] !== 'new'),
    [currentConvoId, conversationId, isLatestConvo, activeConvos],
  );

  useEffect(() => {
    if (title !== previousTitle.current) {
      setTitleInput(title as string);
      previousTitle.current = title;
    }
  }, [title]);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const handleClick = useCallback(
    async (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
        toggleNav();
        return;
      }

      event.preventDefault();

      if (currentConvoId === conversationId || isPopoverActive) {
        return;
      }

      toggleNav();

      if (typeof title === 'string' && title.length > 0) {
        document.title = title;
      }

      navigateWithLastTools(
        conversation,
        !(conversationId ?? '') || conversationId === Constants.NEW_CONVO,
      );
    },
    [
      currentConvoId,
      conversationId,
      isPopoverActive,
      toggleNav,
      title,
      conversation,
      navigateWithLastTools,
    ],
  );

  const handleRename = useCallback(() => {
    setIsPopoverActive(false);
    setTitleInput(title as string);
    setRenaming(true);
  }, [title]);

  const handleRenameSubmit = useCallback(
    async (e: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLInputElement> | KeyEvent) => {
      e.preventDefault();

      if (!conversationId || titleInput === title) {
        setRenaming(false);
        return;
      }

      try {
        await updateConvoMutation.mutateAsync({
          conversationId,
          title: titleInput.trim() || localize('com_ui_untitled'),
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
    },
    [conversationId, title, titleInput, updateConvoMutation, showToast, localize],
  );

  const handleKeyDown = useCallback(
    (e: KeyEvent) => {
      switch (e.key) {
        case 'Escape':
          setTitleInput(title as string);
          setRenaming(false);
          break;
        case 'Enter':
          handleRenameSubmit(e);
          break;
      }
    },
    [title, handleRenameSubmit],
  );

  const handleCancelRename = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setTitleInput(title as string);
      setRenaming(false);
    },
    [title],
  );

  return (
    <div
      className={cn(
        'group relative flex w-full items-center rounded-lg transition-colors duration-200',
        isSmallScreen ? 'h-12' : 'h-9',
        isActiveConvo ? 'bg-surface-active-alt' : 'hover:bg-surface-active-alt',
      )}
      role="listitem"
    >
      {renaming ? (
        <div
          className="absolute inset-0 z-20 flex w-full items-center rounded-lg bg-surface-active-alt p-1.5"
          role="form"
          aria-label={localize('com_ui_rename_conversation')}
        >
          <input
            ref={inputRef}
            type="text"
            className="w-full rounded bg-transparent p-0.5 text-sm leading-tight focus-visible:outline-none"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleRenameSubmit}
            maxLength={100}
            aria-label={localize('com_ui_new_conversation_title')}
          />
          <div className="flex gap-1" role="toolbar">
            <button
              onClick={handleCancelRename}
              className="p-1 hover:opacity-70 focus:outline-none focus:ring-2"
              aria-label={localize('com_ui_cancel')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={handleRenameSubmit}
              className="p-1 hover:opacity-70 focus:outline-none focus:ring-2"
              aria-label={localize('com_ui_save')}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <a
          href={`/c/${conversationId}`}
          onClick={handleClick}
          className={cn(
            'flex grow cursor-pointer items-center gap-2 overflow-hidden rounded-lg px-2',
            isActiveConvo ? 'bg-surface-active-alt' : '',
          )}
          title={title ?? undefined}
          aria-current={isActiveConvo ? 'page' : undefined}
          data-testid="convo-item"
        >
          <EndpointIcon
            conversation={conversation}
            endpointsConfig={endpointsConfig}
            size={20}
            context="menu-item"
          />
          <div
            className="relative flex-1 grow overflow-hidden whitespace-nowrap"
            style={{ textOverflow: 'clip' }}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRename();
            }}
          >
            {title || localize('com_ui_untitled')}
          </div>

          <div
            className={cn(
              'absolute bottom-0 right-0 top-0 w-20 rounded-r-lg bg-gradient-to-l',
              isActiveConvo
                ? 'from-surface-active-alt'
                : 'from-surface-primary-alt from-0% to-transparent group-hover:from-surface-active-alt group-hover:from-40%',
            )}
            aria-hidden="true"
          />
        </a>
      )}
      <div
        className={cn(
          'mr-2',
          isPopoverActive || isActiveConvo
            ? 'flex'
            : 'hidden group-focus-within:flex group-hover:flex',
        )}
      >
        {!renaming && (
          <ConvoOptions
            title={title}
            retainView={retainView}
            renameHandler={handleRename}
            isActiveConvo={isActiveConvo}
            conversationId={conversationId}
            isPopoverActive={isPopoverActive}
            setIsPopoverActive={setIsPopoverActive}
          />
        )}
      </div>
    </div>
  );
}
