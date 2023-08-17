import { useEffect, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { localize } from '~/localization/Translation';
import PrivateButton from '../Conversations/PrivateButton';
import LikeIcon from '../svg/LikeIcon';
import { CSSTransition } from 'react-transition-group';
import store from '~/store';
import { useAuthContext } from '~/hooks/AuthContext';
import { useUpdateConversationMutation } from '@librechat/data-provider';

export default function MessageHeaderButtons() {
  const { user } = useAuthContext();
  const lang = useRecoilValue(store.lang);
  const [conversation, setConversation] = useRecoilState(store.conversation);
  const { conversationId } = conversation;
  const updateConvoMutation = useUpdateConversationMutation(conversation?.conversationId);
  const { refreshConversations } = store.useConversations();

  // UI states
  const [privateState, setPrivateState] = useState(conversation.isPrivate);
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(conversation.likedBy ? conversation.likedBy[user.id] : false);
  const [numOfLikes, setNumOfLikes] = useState(conversation.likes);
  const [likedBy, setLikedBy] = useState(conversation.likedBy);

  // Copies conversation share link
  const copyShareLinkHandler = () => {
    if (copied) return;
    navigator.clipboard.writeText(window.location.host + `/chat/share/${conversationId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Set conversation's private state
  const setPrivateHandler = (e) => {
    e.preventDefault();
    updateConvoMutation.mutate({ conversationId, isPrivate: !privateState });
    setPrivateState(!privateState);
  };

  // Likes the conversation
  const likeHandler = async () => {
    // update component state
    setLiked(!liked);

    if (liked) {
      // update states
      const likedyByUpdate = {};
      likedyByUpdate[`${user.id}`] = false;
      setLikedBy({ ...likedBy, ...likedyByUpdate });
      setNumOfLikes(numOfLikes - 1);

      // update DB
      const update = {}
      update[`likedBy.${user.id}`] = false;
      update.likes = numOfLikes - 1;
      updateConvoMutation.mutate({ conversationId, ...update });
    } else {
      // update states
      const likedyByUpdate = {};
      likedyByUpdate[`${user.id}`] = true;
      setLikedBy({ ...likedBy, ...likedyByUpdate });
      setNumOfLikes(numOfLikes + 1);

      // update DB
      const update = {}
      update[`likedBy.${user.id}`] = true;
      update.likes = numOfLikes + 1;
      updateConvoMutation.mutate({ conversationId, ...update });
    }
  }

  useEffect(() => {
    setLiked(conversation.likedBy ? conversation.likedBy[user.id] : false);
    setNumOfLikes(conversation.likes);
    setPrivateState(conversation.isPrivate);
    setLikedBy(conversation.likedBy);
  }, [conversation]);

  useEffect(() => {
    if (updateConvoMutation.isSuccess) {
      refreshConversations();
      setConversation((prevState) => ({
        ...prevState,
        isPrivate: privateState,
        likes: numOfLikes,
        likedBy: likedBy
      })
      )
    }
  }, [updateConvoMutation.isSuccess]);

  return(
    <>
      <div className="sticky top-0 w-full z-10">
        <div className='flex flex-row w-full gap-2 justify-center items-center border-b px-1 border-black/10 bg-gray-50 dark:border-gray-900/50 dark:bg-gray-700 dark:text-gray-200'>
          {/*Copy share link button*/}
          <button onClick={ copyShareLinkHandler } className='p-1 hover:bg-gray-200 hover:dark:bg-gray-500'>
            <svg className="h-5 w-5" width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g id="Communication / Share_iOS_Export">
                <path id="Vector" d="M9 6L12 3M12 3L15 6M12 3V13M7.00023 10C6.06835 10 5.60241 10 5.23486 10.1522C4.74481 10.3552 4.35523 10.7448 4.15224 11.2349C4 11.6024 4 12.0681 4 13V17.8C4 18.9201 4 19.4798 4.21799 19.9076C4.40973 20.2839 4.71547 20.5905 5.0918 20.7822C5.5192 21 6.07899 21 7.19691 21H16.8036C17.9215 21 18.4805 21 18.9079 20.7822C19.2842 20.5905 19.5905 20.2839 19.7822 19.9076C20 19.4802 20 18.921 20 17.8031V13C20 12.0681 19.9999 11.6024 19.8477 11.2349C19.6447 10.7448 19.2554 10.3552 18.7654 10.1522C18.3978 10 17.9319 10 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </g>
            </svg>
          </button>

          {/*Set private button*/}
          <PrivateButton
            isPrivate={privateState}
            setPrivateHandler={ setPrivateHandler }
          />

          {/*Like button and number of likes*/}
          <button
            className='flex flex-row items-center gap-1 ml-0.5 pr-1 hover:bg-gray-200 hover:dark:bg-gray-500'
            onClick={ likeHandler }
          >
            <div className='p-1'>
              <LikeIcon filled={liked} />
            </div>
            <div className='ml-px mr-0.5'>
              {numOfLikes}
            </div>
            <div>
              {localize(lang, 'com_ui_number_of_likes')}
            </div>
          </button>
        </div>
      </div>
      {/*Copied indicator*/}
      <CSSTransition
        in={copied}
        timeout={2000}
        classNames="copied-toast"
        unmountOnExit={false}
      >
        <div className='opacity-0 invisible absolute bottom-32 z-10 text-black text-md bg-gray-200 py-1 px-3 rounded-full'>
          {localize(lang, 'com_ui_copied')}
        </div>
      </CSSTransition>

    </>
  );
}