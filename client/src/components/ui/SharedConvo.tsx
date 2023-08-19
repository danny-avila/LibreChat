import { TConversation, TUser, TMessage } from '@librechat/data-provider';
import React, { useEffect, useState } from 'react';
import { CSSTransition } from 'react-transition-group';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuthContext } from '~/hooks/AuthContext';
import buildTree from '~/utils/buildTree';
import { Spinner } from '../svg';
import MultiMessage from '../Messages/MultiMessage';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import { useScreenshot } from '~/utils/screenshotContext';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { localize } from '~/localization/Translation';
import { Plugin } from '../svg';
import { alternateName } from '~/utils';

export default function SharedConvo() {
  const [conversation, setConversation] = useState<TConversation | null>(null);
  const [msgTree, setMsgTree] = useState<TMessage[] | null>(null);
  const [convoUser, setConvoUser] = useState<TUser | null>(null);
  const [isPrivate, setIsPrivate] = useState<boolean>(false);
  const [pageTitle, setPageTitle] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [shareLink, setShareLink] = useState<string>('');

  const [liked, setLiked] = useState<boolean>(false);
  const [numOfLikes, setNumOfLikes] = useState<number>(0);
  const [showRegMsg, setShowRegMsg] = useState<boolean>(false);
  const lang = useRecoilValue(store.lang);

  const { screenshotTargetRef } = useScreenshot();
  const { user, token } = useAuthContext();
  const { conversationId } = useParams();
  const navigate = useNavigate();

  const plugins = (
    <>
      <Plugin className='' />{' '}
      <span className="px-1">•</span>
      <span className="py-0.25 ml-1 rounded bg-blue-200 px-1 text-[10px] font-semibold uppercase text-[#4559A4]">
        beta
      </span>
      <span className="px-1">•</span>
      Model: {conversation ? conversation.model : 'No Model'}
    </>
  );

  const getConversationTitle = () => {
    const convo: any = conversation ? conversation : {};
    const { endpoint, model } = convo
    let _title = `${alternateName[endpoint] ?? endpoint}`;

    if (endpoint === 'azureOpenAI' || endpoint === 'openAI') {
      const { chatGptLabel } = convo;
      if (model) _title += `: ${model}`;
      if (chatGptLabel) _title += ` as ${chatGptLabel}`;
    } else if (endpoint === 'google') {
      _title = 'PaLM';
      const { modelLabel, model } = convo;
      if (model) _title += `: ${model}`;
      if (modelLabel) _title += ` as ${modelLabel}`;
    } else if (endpoint === 'bingAI') {
      const { jailbreak, toneStyle } = convo;
      if (toneStyle) _title += `: ${toneStyle}`;
      if (jailbreak) _title += ' as Sydney';
    } else if (endpoint === 'chatGPTBrowser') {
      if (model) _title += `: ${model}`;
    } else if (endpoint === 'gptPlugins') {
      return plugins;
    } else if (endpoint === null) {
      null;
    } else {
      null;
    }
    return _title;
  };

  // Allows navigation to user's profile page
  const navigateToProfile = () => {
    navigate(`/profile/${convoUser?.id}`);
  }

  // Displays message suggesting the viewer to register
  const showRegMsgHandler = () => {
    if (showRegMsg) return;
    setShowRegMsg(true);
    setTimeout(() => setShowRegMsg(false), 2000);
  }

  // Likes the conversation
  const likeHandler = async () => {
    if (!conversation || !user) return;

    // update component state
    setLiked(!liked);

    // Initiate these properties if they do not exist
    if (!conversation.likedBy) conversation.likedBy = {};
    if (!conversation.likes) conversation.likes = 0;

    // update state object
    if (liked) {
      setNumOfLikes(numOfLikes - 1);
      conversation.likes = conversation.likes - 1;
      conversation.likedBy[user.id] = false;
    } else {
      setNumOfLikes(numOfLikes + 1);
      conversation.likes = conversation.likes + 1;
      conversation.likedBy[user.id] = true;
    }

    // update database
    try {
      await fetch('/api/convos/like', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversationId: conversation.conversationId,
          userId: user?.id,
          liked: !liked
        })
      });
    } catch (error) {
      console.log(error);
    }
  }

  const copyShareLinkHandler = () => {
    if (copied) return;
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Fetch the shared conversation
  async function fetchConversation() {
    try {
      const response = await fetch(`/api/convos/share/${conversationId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const responseObject = await response.json();
      setConversation(responseObject);
    } catch (error) {
      console.log(error);
    }
  }

  // Fetch messages of the current conversation
  async function fetchMessagesByConvoId(id: string) {
    setMsgTree(null);
    try {
      const response = await fetch(`/api/messages/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const responseObject = await response.json();
      setMsgTree(buildTree(responseObject));
    } catch (error) {
      console.log(error);
    }
  }

  // Fetch the user who owns the current conversation
  async function fetchConvoUser(id: string | undefined) {
    setConvoUser(null);
    try {
      const response = await fetch(`/api/user/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const responseObject = await response.json();
      setConvoUser(responseObject);
    } catch (error) {
      console.log(error);
    }
  }

  // Get recommendations on mount
  useEffect(() => {
    fetchConversation();
  }, [token]);

  // Check if the conversation has been set as private
  useEffect(() => {
    if (conversation && !conversation.isPrivate) {
      setIsPrivate(false);
      fetchMessagesByConvoId(conversation.conversationId);
      fetchConvoUser(conversation.user);
      setPageTitle(conversation.title);
      setShareLink(window.location.host +  `/chat/share/${conversation.conversationId}`);
      setNumOfLikes(conversation.likes);

      if (user) setLiked(conversation.likedBy[user?.id]);
    } else {
      setIsPrivate(true);
      setPageTitle(localize(lang, 'com_ui_private_conversation'));
    }
  }, [conversation, user]);

  useDocumentTitle(pageTitle);

  return(
    <div className='overflow-y-auto mt-2 justify-center z-0'>
      {isPrivate ? (
        <div className='flex w-full mt-36 text-3xl items-center justify-center text-center'>
          {localize(lang, 'com_ui_private_conversation')}
        </div>
      ) : (
        <>
          <div className='grid grid-row w-full gap-1 sticky bg-white top-0 z-30 justify-center items-center text-gray-800 dark:text-gray-100 dark:bg-gray-800'>
            <h1
              id="landing-title"
              className="ml-auto mr-auto mt-0.5 flex gap-2 text-center text-3xl font-semibold"
            >
              {conversation ? conversation.title : ''}
            </h1>
            <div className='my-2 flex flex-row justify-self-center gap-2'>
              {convoUser && (<div className='my-2 flex flex-row flex-wrap justify-center items-center justify-self-center text-lg'>
                {/*Conversation author*/}
                <button
                  onClick={ navigateToProfile }
                  className='flex flex-row gap-1 py-1 px-2 mx-2 items-center hover:bg-gray-200 dark:hover:bg-gray-600'
                >
                  <div
                    title={convoUser?.username}
                    style={{
                      width: 30,
                      height: 30
                    }}
                    className={'justify-self-center relative flex items-center justify-center'}
                  >
                    <img
                      className="rounded-sm"
                      src={
                        convoUser?.avatar ||
                        `https://api.dicebear.com/6.x/initials/svg?seed=${convoUser?.name}&fontFamily=Verdana&fontSize=36`
                      }
                      alt="avatar"
                    />
                  </div>
                  <div>
                    {convoUser?.username}
                  </div>
                </button>

                {/*Model and endpoint*/}
                <div className='px-3 py-1 border-x-2'>
                  {getConversationTitle()}
                </div>

                <div className='flex flex-row px-2 items-center gap-1'>
                  {/*Share button*/}
                  <button className='flex flex-row items-center gap-1 p-1 hover:bg-gray-200 dark:hover:bg-gray-600' onClick={ copyShareLinkHandler }>
                    <svg className="h-5 w-5" width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <g id="Communication / Share_iOS_Export">
                        <path id="Vector" d="M9 6L12 3M12 3L15 6M12 3V13M7.00023 10C6.06835 10 5.60241 10 5.23486 10.1522C4.74481 10.3552 4.35523 10.7448 4.15224 11.2349C4 11.6024 4 12.0681 4 13V17.8C4 18.9201 4 19.4798 4.21799 19.9076C4.40973 20.2839 4.71547 20.5905 5.0918 20.7822C5.5192 21 6.07899 21 7.19691 21H16.8036C17.9215 21 18.4805 21 18.9079 20.7822C19.2842 20.5905 19.5905 20.2839 19.7822 19.9076C20 19.4802 20 18.921 20 17.8031V13C20 12.0681 19.9999 11.6024 19.8477 11.2349C19.6447 10.7448 19.2554 10.3552 18.7654 10.1522C18.3978 10 17.9319 10 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </g>
                    </svg>
                    {localize(lang, 'com_ui_share')}
                  </button>

                  {/*Like button*/}
                  <button className='flex flex-row items-center gap-1 p-1 ml-0.5 hover:bg-gray-200 dark:hover:bg-gray-600' onClick={ user ? likeHandler : showRegMsgHandler }>
                    <div>
                      <svg
                        stroke="currentColor"
                        fill={liked ? 'currentColor' : 'none'}
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                        height="1em"
                        width="1em"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                      </svg>
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
              )}
            </div>
          </div>
          <div className="dark:gpt-dark-gray mb-32 h-auto w-full md:mb-48" ref={screenshotTargetRef}>
            <div className="dark:gpt-dark-gray flex h-auto flex-col items-center text-sm">
              {conversation && msgTree && convoUser ? (
                <MultiMessage
                  key={conversation.conversationId} // avoid internal state mixture
                  messageId={conversation.conversationId}
                  conversation={conversation}
                  messagesTree={msgTree}
                  scrollToBottom={null}
                  currentEditId={-1}
                  setCurrentEditId={null}
                  isSearchView={true}
                  name={convoUser?.name}
                  userId={convoUser?.id}
                />
              ) : (
                <div className="flex w-full h-[25vh] flex-row items-end justify-end">
                  <Spinner />
                </div>
              )}
            </div>
          </div>
          <CSSTransition
            in={copied}
            timeout={2000}
            classNames="copied-toast"
            unmountOnExit={false}
          >
            <div className='flex flex-col items-center opacity-0 invisible'>
              <div className='absolute bottom-20 text-black text-md bg-gray-200 py-1 px-3 rounded-full'>
                {localize(lang, 'com_ui_copied')}
              </div>
            </div>
          </CSSTransition>
          <CSSTransition
            in={showRegMsg}
            timeout={2000}
            classNames="copied-toast"
            unmountOnExit={false}
          >
            <div className='flex flex-col items-center opacity-0 invisible'>
              <div className='absolute bottom-20 text-black text-md bg-gray-200 py-1 px-3 rounded-full'>
                {localize(lang, 'com_ui_register_before_like')}
              </div>
            </div>
          </CSSTransition>
        </>
      )}
    </div>
  );
}