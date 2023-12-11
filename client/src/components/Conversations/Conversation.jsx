import { useState, useRef } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { useUpdateConversationMutation } from 'librechat-data-provider/react-query';
import { useConversations, useConversation } from '~/hooks';
import { MinimalIcon } from '~/components/Endpoints';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import DeleteButton from './DeleteButton';
import RenameButton from './RenameButton';
import store from '~/store';

export default function Conversation({ conversation, retainView }) {
  const { showToast } = useToastContext();
  const [currentConversation, setCurrentConversation] = useRecoilState(store.conversation);
  const setSubmission = useSetRecoilState(store.submission);

  const { refreshConversations } = useConversations();
  const { switchToConversation } = useConversation();

  const updateConvoMutation = useUpdateConversationMutation(currentConversation?.conversationId);

  const [renaming, setRenaming] = useState(false);
  const inputRef = useRef(null);

  const { conversationId, title } = conversation;

  const [titleInput, setTitleInput] = useState(title);

  const clickHandler = async () => {
    if (currentConversation?.conversationId === conversationId) {
      return;
    }

    // stop existing submission
    setSubmission(null);

    // set document title
    document.title = title;

    // set conversation to the new conversation
    if (conversation?.endpoint === 'gptPlugins') {
      const lastSelectedTools = JSON.parse(localStorage.getItem('lastSelectedTools')) || [];
      switchToConversation({ ...conversation, tools: lastSelectedTools });
    } else {
      switchToConversation(conversation);
    }
  };

  const renameHandler = (e) => {
    e.preventDefault();
    setTitleInput(title);
    setRenaming(true);
    setTimeout(() => {
      inputRef.current.focus();
    }, 25);
  };

  const cancelHandler = (e) => {
    e.preventDefault();
    setRenaming(false);
  };

  const onRename = (e) => {
    e.preventDefault();
    setRenaming(false);
    if (titleInput === title) {
      return;
    }
    updateConvoMutation.mutate(
      { conversationId, title: titleInput },
      {
        onSuccess: () => {
          refreshConversations();
          if (conversationId == currentConversation?.conversationId) {
            setCurrentConversation((prevState) => ({
              ...prevState,
              title: titleInput,
            }));
          }
        },
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
    endpoint: conversation.endpoint,
    model: conversation.model,
    error: false,
    className: 'mr-0',
  });

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onRename(e);
    }
  };

  const aProps = {
    className:
      'animate-flash group relative flex cursor-pointer items-center gap-3 break-all rounded-md bg-gray-800 py-3 px-3 pr-14 hover:bg-gray-800',
  };

  if (currentConversation?.conversationId !== conversationId) {
    aProps.className =
      'group relative flex cursor-pointer items-center gap-3 break-all rounded-md py-3 px-3 hover:bg-gray-900 hover:pr-4';
  }

  return (
    <a data-testid="convo-item" onClick={() => clickHandler()} {...aProps}>
      {icon}
      <div className="relative max-h-5 flex-1 overflow-hidden text-ellipsis break-all">
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
      {currentConversation?.conversationId === conversationId ? (
        <div className="visible absolute right-1 z-10 flex text-gray-300">
          <RenameButton
            conversationId={conversationId}
            renaming={renaming}
            renameHandler={renameHandler}
            onRename={onRename}
          />
          <DeleteButton
            conversationId={conversationId}
            renaming={renaming}
            cancelHandler={cancelHandler}
            retainView={retainView}
            title={title}
          />
        </div>
      ) : (
        <div className="absolute inset-y-0 right-0 z-10 w-8 rounded-r-md bg-gradient-to-l from-black group-hover:from-gray-900" />
      )}
    </a>
  );
}
