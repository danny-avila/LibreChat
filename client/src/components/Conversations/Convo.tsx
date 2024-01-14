import { useRecoilValue } from 'recoil';
import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  useGetEndpointsQuery,
  useUpdateConversationMutation,
} from 'librechat-data-provider/react-query';
import { EModelEndpoint } from 'librechat-data-provider';
import type { MouseEvent, FocusEvent, KeyboardEvent } from 'react';
import { useConversations, useNavigateToConvo } from '~/hooks';
import { MinimalIcon } from '~/components/Endpoints';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import DeleteButton from './NewDeleteButton';
import { getEndpointField } from '~/utils';
import RenameButton from './RenameButton';
import store from '~/store';

type KeyEvent = KeyboardEvent<HTMLInputElement>;

export default function Conversation({ conversation, retainView, toggleNav, i }) {
  const { conversationId: currentConvoId } = useParams();
  const updateConvoMutation = useUpdateConversationMutation(currentConvoId ?? '');
  const activeConvos = useRecoilValue(store.allConversationsSelector);
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { refreshConversations } = useConversations();
  const { navigateToConvo } = useNavigateToConvo();
  const { showToast } = useToastContext();

  const { conversationId, title } = conversation;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [titleInput, setTitleInput] = useState(title);
  const [renaming, setRenaming] = useState(false);

  const clickHandler = async () => {
    if (currentConvoId === conversationId) {
      return;
    }

    toggleNav();

    // set document title
    document.title = title;

    // set conversation to the new conversation
    if (conversation?.endpoint === EModelEndpoint.gptPlugins) {
      let lastSelectedTools = [];
      try {
        lastSelectedTools = JSON.parse(localStorage.getItem('lastSelectedTools') ?? '') ?? [];
      } catch (e) {
        // console.error(e);
      }
      navigateToConvo({ ...conversation, tools: lastSelectedTools });
    } else {
      navigateToConvo(conversation);
    }
  };

  const renameHandler = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setTitleInput(title);
    setRenaming(true);
    setTimeout(() => {
      if (!inputRef.current) {
        return;
      }
      inputRef.current.focus();
    }, 25);
  };

  const onRename = (e: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLInputElement> | KeyEvent) => {
    e.preventDefault();
    setRenaming(false);
    if (titleInput === title) {
      return;
    }
    updateConvoMutation.mutate(
      { conversationId, title: titleInput },
      {
        onSuccess: () => refreshConversations(),
        onError: () => {
          setTitleInput(title);
          showToast({
            message: 'Failed to rename conversation',
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          });
        },
      },
    );
  };

  const icon = MinimalIcon({
    size: 20,
    iconURL: getEndpointField(endpointsConfig, conversation.endpoint, 'iconURL'),
    endpoint: conversation.endpoint,
    endpointType: conversation.endpointType,
    model: conversation.model,
    error: false,
    className: 'mr-0',
    isCreatedByUser: false,
  });

  const handleKeyDown = (e: KeyEvent) => {
    if (e.key === 'Enter') {
      onRename(e);
    }
  };

  const aProps = {
    className:
      'animate-flash group relative flex cursor-pointer items-center gap-3 break-all rounded-md bg-gray-900 py-3 px-3 pr-14 hover:bg-gray-900',
  };

  const activeConvo =
    currentConvoId === conversationId ||
    (i === 0 && currentConvoId === 'new' && activeConvos[0] && activeConvos[0] !== 'new');

  if (!activeConvo) {
    aProps.className =
      'group relative flex cursor-pointer items-center gap-3 break-all rounded-md py-3 px-3 hover:bg-gray-900 hover:pr-4';
  }

  return (
    <a data-testid="convo-item" onClick={() => clickHandler()} {...aProps} title={title}>
      {icon}
      <div className="relative line-clamp-1 max-h-5 flex-1 text-ellipsis break-all">
        {renaming === true ? (
          <input
            ref={inputRef}
            type="text"
            className="m-0 mr-0 w-full border border-blue-500 bg-transparent p-0 text-sm leading-tight outline-none"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={onRename}
            onKeyDown={handleKeyDown}
          />
        ) : (
          title
        )}
      </div>
      {activeConvo ? (
        <div className="visible absolute right-1 z-10 flex text-gray-400">
          <RenameButton renaming={renaming} onRename={onRename} renameHandler={renameHandler} />
          <DeleteButton
            conversationId={conversationId}
            retainView={retainView}
            renaming={renaming}
            title={title}
          />
        </div>
      ) : (
        <div className="absolute inset-y-0 right-0 z-10 w-8 rounded-r-md bg-gradient-to-l from-black group-hover:from-gray-900" />
      )}
    </a>
  );
}
