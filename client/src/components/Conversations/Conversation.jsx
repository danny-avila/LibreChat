import { useState, useRef, useEffect } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { useUpdateConversationMutation } from '@librechat/data-provider';
import RenameButton from './RenameButton';
import DeleteButton from './DeleteButton';
import ConvoIcon from '../svg/ConvoIcon';
import store from '~/store';
import PrivateButton from './PrivateButton';
import LikeIcon from '../svg/LikeIcon';
import { useNavigate, useParams } from 'react-router-dom';

export default function Conversation({ conversation, retainView }) {
  const [currentConversation, setCurrentConversation] = useRecoilState(store.conversation);
  const { conversationId: convoId } = useParams();
  const setSubmission = useSetRecoilState(store.submission);

  const { refreshConversations } = store.useConversations();
  const { switchToConversation } = store.useConversation();

  const updateConvoMutation = useUpdateConversationMutation(currentConversation?.conversationId);

  const [renaming, setRenaming] = useState(false);
  const inputRef = useRef(null);

  const { conversationId, title, isPrivate } = conversation;

  const [titleInput, setTitleInput] = useState(title);

  const [privateState, setPrivateState] = useState(isPrivate);
  const [isLiked, setIsLiked] = useState(false);

  const navigate = useNavigate();

  // initial fetch to find out if it is being liked
  // const fetchLikeStatus = async () => {
  //   try {
  //     const response = await fetch(`/api/convos/${conversationId}`, {
  //       method: 'GET',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         Authorization: `Bearer ${token}`
  //       } }
  //     )

  //     const data = await response.json();
  //     // Update the isLiked state based on the data received from the API
  //     const likesCount = data.likesConvo;
  //     if (likesCount !== 0) {
  //       setIsLiked(true);
  //     }
  //   } catch (error) {
  //     console.log('Error fetching like status:', error);
  //   }
  // };

  useEffect(() => {
    // Get the current like status from localStorage
    const currentLikeStatus = localStorage.getItem(`liked:${conversationId}`) === 'true';

    // Set the initial isLiked state based on the value from localStorage
    setIsLiked(currentLikeStatus);
  }, []);

  const handleLikeClick = async () => {
    try {
      const response = await fetch('/api/convos/like', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversationId: conversationId,
          isLiked: !isLiked
        })
      });
      const data = await response.json();
      if (data.conversation) {
        console.log(data.conversation);
        return;
      }
      // Get the current like status from localStorage
      const currentLikeStatus = localStorage.getItem(`liked:${conversationId}`) === 'true';

      // Toggle the like status and update the state
      setIsLiked(!currentLikeStatus);

      // Update the like status in localStorage
      localStorage.setItem(`liked:${conversationId}`, !currentLikeStatus);
    } catch (error) {
      console.log('Error liking conversation:', error);
    }
  };
  const clickHandler = async () => {
    if (currentConversation?.conversationId === conversationId &&
      currentConversation?.conversationId === convoId &&
      conversationId === convoId) {
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

    navigate(`/chat/${conversationId}`);
  };

  const setPrivateHandler = (e) => {
    e.preventDefault();
    updateConvoMutation.mutate({ conversationId, isPrivate: !privateState });
    setPrivateState(!privateState);
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
    updateConvoMutation.mutate({ conversationId, title: titleInput });
  };

  useEffect(() => {
    if (updateConvoMutation.isSuccess) {
      refreshConversations();
      if (conversationId == currentConversation?.conversationId) {
        setCurrentConversation((prevState) => ({
          ...prevState,
          title: titleInput
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateConvoMutation.isSuccess]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onRename(e);
    }
  };

  const aProps = {
    className:
      'animate-flash group relative flex cursor-pointer items-center gap-3 break-all rounded-md bg-gray-800 py-3 px-3 pr-14 hover:bg-gray-800'
  };

  if (currentConversation?.conversationId !== conversationId || currentConversation?.conversationId !== convoId) {
    aProps.className =
      'group relative flex cursor-pointer items-center gap-3 break-all rounded-md py-3 px-3 hover:bg-gray-800 hover:pr-4';
  }

  return (
    <a data-testid="convo-item" onClick={() => clickHandler()} {...aProps}>
      <ConvoIcon />
      <div className="relative max-h-5 flex-1 overflow-hidden text-ellipsis break-all pr-8">
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

      {(currentConversation?.conversationId === conversationId &&
        currentConversation?.conversationId === convoId &&
        conversationId === convoId) ? (
          <div className="visible absolute right-1 z-10 ml-3 flex text-gray-300">
            <LikeIcon filled={isLiked} style={{ marginTop: '0.25rem' }} onClick={handleLikeClick} />
            <PrivateButton
              conversationId={conversationId}
              isPrivate={privateState}
              setPrivateHandler={setPrivateHandler}
            />
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
            />
          </div>
        ) : (
          <div className="absolute inset-y-0 right-0 z-10 w-8 rounded-r-md bg-gradient-to-l from-gray-900 group-hover:from-gray-700/70" />
        )}
    </a>
  );
}
