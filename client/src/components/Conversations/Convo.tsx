import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { EModelEndpoint } from 'librechat-data-provider';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { MouseEvent, FocusEvent, KeyboardEvent } from 'react';
import { useConversations, useNavigateToConvo } from '~/hooks';
import { useUpdateConversationMutation } from '~/data-provider';
import { MinimalIcon } from '~/components/Endpoints';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import DeleteButton from './NewDeleteButton';
import { getEndpointField } from '~/utils';
import RenameButton from './RenameButton';
import store from '~/store';
import { useRecoilValue } from 'recoil';

type KeyEvent = KeyboardEvent<HTMLInputElement>;

export default function Conversation({ conversation, retainView, toggleNav, isLatestConvo }) {
  const { conversationId: currentConvoId } = useParams();
  const updateConvoMutation = useUpdateConversationMutation(currentConvoId ?? '');
  const activeConvos = useRecoilValue(store.allConversationsSelector);
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { refreshConversations } = useConversations();
  const { navigateToConvo } = useNavigateToConvo();
  const { showToast } = useToastContext();
  const [hovering, setHovering] = useState(false);

  const { conversationId, title } = conversation;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [titleInput, setTitleInput] = useState(title);
  const [renaming, setRenaming] = useState(false);

  const clickHandler = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button === 0 && event.ctrlKey) {
      toggleNav();
      return;
    }

    event.preventDefault();
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
      'group relative rounded-lg active:opacity-90 flex cursor-pointer items-center mt-2 gap-3 break-all rounded-lg bg-gray-800 py-2 px-2',
  };

  const activeConvo =
    currentConvoId === conversationId ||
    (isLatestConvo && currentConvoId === 'new' && activeConvos[0] && activeConvos[0] !== 'new');

  if (!activeConvo) {
    aProps.className =
      'group relative rounded-lg active:opacity-90 flex cursor-pointer items-center mt-2 gap-3 break-all rounded-lg py-2 px-2 hover:bg-gray-900';
  }

  return (
    <a
      href={`/c/${conversationId}`}
      data-testid="convo-item"
      onClick={clickHandler}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      {...aProps}
      title={title}
    >
      {icon}
      <div className="relative mr-8 line-clamp-1 max-h-5 flex-1 grow overflow-hidden">
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
          <span className={`${activeConvo ? 'text-white' : 'text-white'} text-sm`}>{title}</span>
        )}
      </div>
      <div
        className={`absolute bottom-0 top-0 ${
          activeConvo ? `w-${title.length * 5}` : 'w-20'
        } from-bg-black to-bg-gray-900 z-0 h-full rounded-r-lg bg-gradient-to-l transition-all`}
      />

      {hovering || activeConvo ? (
        <div className="visible absolute bottom-0 right-1 top-0 z-10 flex items-center gap-0">
          <RenameButton renaming={renaming} onRename={onRename} renameHandler={renameHandler} />
          <DeleteButton
            conversationId={conversationId}
            retainView={retainView}
            renaming={renaming}
            title={title}
          />
        </div>
      ) : (
        <div
          className={`absolute bottom-0 right-${
            hovering || activeConvo ? 10 : 0
          } top-0 w-20 rounded-lg bg-gradient-to-l from-black from-0% to-transparent group-hover:from-gray-900`}
        />
      )}
    </a>
  );
}
