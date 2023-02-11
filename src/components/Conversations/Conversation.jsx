import React, { useState, useRef } from 'react';
import RenameButton from './RenameButton';
import DeleteButton from './DeleteButton';
import { useSelector, useDispatch } from 'react-redux';
import { setConversation } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';
import { setText } from '~/store/textSlice';
import manualSWR from '~/utils/fetchers';
import ConvoIcon from '../svg/ConvoIcon';

export default function Conversation({ id, parentMessageId, title = 'New conversation' }) {
  const [renaming, setRenaming] = useState(false);
  const [titleInput, setTitleInput] = useState(title);
  const inputRef = useRef(null);
  const dispatch = useDispatch();
  const { conversationId } = useSelector((state) => state.convo);
  const { trigger, isMutating } = manualSWR(`http://localhost:3050/messages/${id}`, 'get');
  const rename = manualSWR(`http://localhost:3050/update_convo`, 'post');

  const clickHandler = async () => {
    if (conversationId === id) {
      return;
    }

    dispatch(setConversation({ title, error: false, conversationId: id, parentMessageId }));
    const data = await trigger();
    dispatch(setMessages(data));
    dispatch(setText(''));
  };

  const renameHandler = (e) => {
    e.preventDefault();
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
    rename.trigger({ conversationId, title: titleInput });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      onRename(e);
    }
  };

  const aProps = {
    className:
      'animate-flash group relative flex cursor-pointer items-center gap-3 break-all rounded-md bg-gray-800 py-3 px-3 pr-14 hover:bg-gray-800'
  };

  if (conversationId !== id) {
    aProps.className =
      'group relative flex cursor-pointer items-center gap-3 break-all rounded-md py-3 px-3 hover:bg-[#2A2B32] hover:pr-4';
  }

  return (
    <a
      onClick={() => clickHandler()}
      {...aProps}
    >
      <ConvoIcon />
      <div className="relative max-h-5 flex-1 overflow-hidden text-ellipsis break-all">
        {renaming === true ? (
          <input
            ref={inputRef}
            type="text"
            className="m-0 mr-0 w-full leading-tight border border-blue-500 bg-transparent p-0 text-sm outline-none"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={onRename}
            onKeyPress={handleKeyPress}
          />
        ) : (
          title
        )}
      </div>
      {conversationId === id ? (
        <div className="visible absolute right-1 z-10 flex text-gray-300">
          <RenameButton
            conversationId={id}
            renaming={renaming}
            renameHandler={renameHandler}
            onRename={onRename}
          />
          <DeleteButton
            conversationId={id}
            renaming={renaming}
            cancelHandler={cancelHandler}
          />
        </div>
      ) : (
        <div className="absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-gray-900 group-hover:from-[#2A2B32]" />
      )}
    </a>
  );
}
