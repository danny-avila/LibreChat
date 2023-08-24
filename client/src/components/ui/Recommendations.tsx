import React, { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from './Tabs';
import { cn } from '~/utils';
import { useRecoilState } from 'recoil';
import { CSSTransition } from 'react-transition-group';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import MultiMessage from '../Messages/MultiMessage';
import buildTree from '~/utils/buildTree';
import { useScreenshot } from '~/utils/screenshotContext.jsx';
import {
  TConversation,
  TMessage,
  TUser,
  useLikeConversationMutation,
} from '@librechat/data-provider';
import SwitchPage from './SwitchPage';
import store from '~/store';
import { localize } from '~/localization/Translation';
import { useRecoilValue } from 'recoil';
import { useAuthContext } from '~/hooks/AuthContext';
import { Spinner } from '../svg';
import { Plugin } from '~/components/svg';
import { useNavigate } from 'react-router-dom';
import { alternateName } from '~/utils';

export default function Recommendations() {
  const [tabValue, setTabValue] = useRecoilState<string>(store.tabValue);

  const [convoIdx, setConvoIdx] = useState<number>(0);
  const [convoDataLength, setConvoDataLength] = useState<number>(1);
  const [convoData, setConvoData] = useState<{ string: TConversation } | null>(null);
  const [convoDataKeys, setConvoDataKeys] = useState<string[] | null>(null);
  const [msgTree, setMsgTree] = useState<TMessage[] | null>(null);
  const [convoUser, setConvoUser] = useState<TUser | null>(null);
  const [lastLeaderboardType, setLastLeaderboardType] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const [liked, setLiked] = useState<boolean>(false);
  const [numOfLikes, setNumOfLikes] = useState<number>(0);

  // @ts-ignore TODO: Fix anti-pattern - requires refactoring conversation store
  const { user, token } = useAuthContext();
  const lang = useRecoilValue(store.lang);
  const title = localize(lang, 'com_ui_recommendation');
  const navigate = useNavigate();
  const likeConvoMutation = useLikeConversationMutation(
    convoData && convoDataKeys && convoData[convoDataKeys[convoIdx]].conversationId
  );

  // Allows navigation to user's profile page
  const navigateToProfile = () => {
    navigate(`/profile/${convoUser?.id}`);
  }

  const plugins = (
    <>
      <Plugin className='' />{' '}
      <span className="px-1">•</span>
      <span className="py-0.25 ml-1 rounded bg-blue-200 px-1 text-[10px] font-semibold uppercase text-[#4559A4]">
        beta
      </span>
      <span className="px-1">•</span>
      Model: {convoData && convoDataKeys && convoDataKeys.length > 0 ? convoData[convoDataKeys[convoIdx]].model : 'No Model'}
    </>
  );

  const getConversationTitle = () => {
    const conversation =
      convoData && convoDataKeys && convoDataKeys.length > 0 ? convoData[convoDataKeys[convoIdx]] : {};
    const { endpoint, model } = conversation
    let _title = `${alternateName[endpoint] ?? endpoint}`;

    if (endpoint === 'azureOpenAI' || endpoint === 'openAI') {
      const { chatGptLabel } = conversation;
      if (model) _title += `: ${model}`;
      if (chatGptLabel) _title += ` as ${chatGptLabel}`;
    } else if (endpoint === 'google') {
      _title = 'PaLM';
      const { modelLabel, model } = conversation;
      if (model) _title += `: ${model}`;
      if (modelLabel) _title += ` as ${modelLabel}`;
    } else if (endpoint === 'bingAI') {
      const { jailbreak, toneStyle } = conversation;
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

  // Fetch the most recent conversations and store in localStorage
  async function fetchRecentConversations() {
    try {
      const response = await fetch('/api/convos/recent', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const responseObject = await response.json();
      window.localStorage.setItem('recentConversations', JSON.stringify(responseObject));

      if (tabValue === 'recent') {
        setConvoData(responseObject);

        const objKeys = Object.keys(responseObject);
        setConvoDataLength(objKeys.length);
        setConvoDataKeys(objKeys);
      }
    } catch (error) {
      console.log(error);
    }
  }

  // Fetch the hottest conversations and store in localStorage
  async function fetchHottestConversations() {
    try {
      const response = await fetch('/api/convos/hottest', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const responseObject = await response.json();
      window.localStorage.setItem('hottestConversations', JSON.stringify(responseObject));

      if (tabValue === 'hottest') {
        setConvoData(responseObject);

        const objKeys = Object.keys(responseObject);
        setConvoDataLength(objKeys.length);
        setConvoDataKeys(objKeys);
      }
    } catch (error) {
      console.log(error);
    }
  }

  // Fetch the conversations by user whom you are following and store in localStorage
  async function fetchFollowingConversations() {
    try {
      const response = await fetch('/api/convos/following', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const responseObject = await response.json();
      window.localStorage.setItem('followingConversations', JSON.stringify(responseObject));

      if (tabValue === 'following') {
        setConvoData(responseObject);

        const objKeys = Object.keys(responseObject);
        setConvoDataLength(objKeys.length);
        setConvoDataKeys(objKeys);
      }
    } catch (error) {
      console.log(error);
    }
  }

  // Fetch the most recent and the hottest conversations, as well as conversations by users
  // whom you are following
  async function fetchRecommendations() {
    const lastFetchedBy = window.localStorage.getItem('lastFetchedBy');
    const last = Number(window.localStorage.getItem('lastFetchTime'));
    const currentTime = Date.now();

    // It has been more than 30 seconds since the last fetch
    // We fetch new conversations from the server
    if ((currentTime - last) > 30000 || lastFetchedBy !== user?.id) {
      setConvoData(null);
      setConvoIdx(0);

      fetchRecentConversations();
      fetchHottestConversations();
      fetchFollowingConversations();

      window.localStorage.setItem('lastFetchTime', currentTime.toString());
      window.localStorage.setItem('lastFetchedBy', user?.id || '');
    } else {
      if (tabValue === lastLeaderboardType) return;

      setConvoData(null);
      setConvoIdx(0);

      let conversations: string | null = null;

      // We retrieve from localStorage if fetch is still on cooldown
      if (tabValue === 'recent') {
        conversations = window.localStorage.getItem('recentConversations');
      } else if (tabValue === 'hottest') {
        conversations = window.localStorage.getItem('hottestConversations');
      } else if (tabValue === 'following') {
        conversations = window.localStorage.getItem('followingConversations');
      }

      if (conversations) {
        const convoObject = JSON.parse(conversations);
        setConvoData(convoObject);

        const objKeys = Object.keys(convoObject);
        setConvoDataLength(objKeys.length);
        setConvoDataKeys(objKeys);
      }
    }

    setLastLeaderboardType(tabValue);
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

  // Likes a conversation
  async function likeConversation() {
    if (!convoData || !convoDataKeys || !user) return;

    // update component state
    setLiked(!liked);

    // Initiate these properties if they do not exist
    if (!convoData[convoDataKeys[convoIdx]].likedBy) convoData[convoDataKeys[convoIdx]].likedBy = {};
    if (!convoData[convoDataKeys[convoIdx]].likes) convoData[convoDataKeys[convoIdx]].likes = 0;

    // update state object
    if (liked) {
      setNumOfLikes(numOfLikes - 1);
      convoData[convoDataKeys[convoIdx]].likes = convoData[convoDataKeys[convoIdx]].likes - 1;
      delete convoData[convoDataKeys[convoIdx]].likedBy[user.id];
    } else {
      setNumOfLikes(numOfLikes + 1);
      convoData[convoDataKeys[convoIdx]].likes = convoData[convoDataKeys[convoIdx]].likes + 1;
      convoData[convoDataKeys[convoIdx]].likedBy[user.id] = new Date();
    }

    // update localStorage
    if (tabValue === 'recent') {
      window.localStorage.setItem('recentConversations', JSON.stringify(convoData));

      const storedHottest = window.localStorage.getItem('hottestConversations');

      if (storedHottest) {
        const convoObject: { string: TConversation } = JSON.parse(storedHottest);

        if (convoObject[convoDataKeys[convoIdx]]) {
          convoObject[convoDataKeys[convoIdx]] = convoData[convoDataKeys[convoIdx]];
          window.localStorage.setItem('hottestConversations', JSON.stringify(convoObject));
        }
      }
    } else if (tabValue === 'hottest') {
      window.localStorage.setItem('hottestConversations', JSON.stringify(convoData));

      const storedRecent = window.localStorage.getItem('recentConversations');

      if (storedRecent) {
        const convoObject: { string: TConversation } = JSON.parse(storedRecent);

        if (convoObject[convoDataKeys[convoIdx]]) {
          convoObject[convoDataKeys[convoIdx]] = convoData[convoDataKeys[convoIdx]];
          window.localStorage.setItem('recentConversations', JSON.stringify(convoObject));
        }
      }
    }

    // Update the Db
    const conversationId = convoData[convoDataKeys[convoIdx]].conversationId;
    likeConvoMutation.mutate({ conversationId: conversationId, userId: user.id, liked: !liked });
  }

  const { screenshotTargetRef } = useScreenshot();

  const nextConvo = () => convoIdx === convoDataLength - 1 ? setConvoIdx(0) : setConvoIdx(convoIdx + 1);
  const prevConvo = () => convoIdx === 0 ? setConvoIdx(convoDataLength - 1) : setConvoIdx(convoIdx - 1);
  const copyShareLinkHandler = () => {
    if (copied) return;
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Get recommendations on mount and when switching leaderboard types
  useEffect(() => {
    if (user) {
      fetchRecommendations();
    }
  }, [user, tabValue]);

  // Set current conversation
  useEffect(() => {
    if (convoData && convoDataKeys && user) {
      if (convoDataKeys.length < 1) return;
      fetchMessagesByConvoId(convoData[convoDataKeys[convoIdx]].conversationId);
      fetchConvoUser(convoData[convoDataKeys[convoIdx]].user);
      setShareLink(window.location.host +  `/chat/share/${convoData[convoDataKeys[convoIdx]].conversationId}`);
      setNumOfLikes(convoData[convoDataKeys[convoIdx]].likes);

      const likedBy = convoData[convoDataKeys[convoIdx]].likedBy;
      if (likedBy) {
        setLiked(likedBy[user.id] ? true : false);
      } else {
        setLiked(false);
      }
    }
  }, [convoData, convoDataKeys, convoIdx, user]);

  useDocumentTitle(title);

  const cardStyle =
    'transition-colors shadow-md rounded-md min-w-[75px] font-normal bg-white border-black/10 hover:border-black/10 focus:border-black/10 dark:border-black/10 dark:hover:border-black/10 dark:focus:border-black/10 border dark:bg-gray-700 text-black dark:text-white';
  const defaultClasses =
    'p-2 rounded-md min-w-[75px] font-normal bg-white/[.60] dark:bg-gray-700 text-black text-xs';
  const defaultSelected = cn(
    defaultClasses,
    'font-medium data-[state=active]:text-white text-xs text-white'
  );
  const selectedTab = (val: string) => val + '-tab ' + defaultSelected;

  if (convoDataKeys?.length === 0) return (
    <div className='ml-2 mt-2'>
      API server did not return any documents. Check if you have an empty database.
    </div>
  );

  return (
    <div className='flex flex-col overflow-y-auto gap-2'>
      <div
        className={
          'flex w-full z-0 flex-wrap items-center justify-center gap-2'
        }
      >
        <Tabs
          value={tabValue}
          className={
            cardStyle +
            ' z-50 flex h-[40px] flex-none items-center justify-center px-0 hover:bg-slate-50 dark:hover:bg-gray-600'
          }
          onValueChange={(value: string) => setTabValue(value)}
        >
          <TabsList className="bg-white/[.60] dark:bg-gray-700">
            <TabsTrigger
              value='recent'
              className={`${tabValue === 'recent' ? selectedTab('creative') : defaultClasses}`}
            >
              <div onClick={ fetchRecommendations }>
                {localize(lang, 'com_ui_recent')}
              </div>
            </TabsTrigger>
            <TabsTrigger
              value='hottest'
              className={`${tabValue === 'hottest' ? selectedTab('balanced') : defaultClasses}`}
            >
              <div onClick={ fetchRecommendations }>
                {localize(lang, 'com_ui_hottest')}
              </div>
            </TabsTrigger>
            <TabsTrigger
              value='following'
              className={`${tabValue === 'following' ? selectedTab('fast') : defaultClasses}`}
            >
              <div onClick={ fetchRecommendations }>
                {localize(lang, 'com_ui_my_following')}
              </div>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex h-full flex-col items-center overflow-y-auto pt-0 text-sm dark:bg-gray-800">
        <div className="flex flex-col items-center w-full px-6 text-gray-800 dark:text-gray-100 md:flex md:max-w-2xl md:flex-col lg:max-w-5xl">
          <>
            <div className='grid grid-row gap-1 w-full sticky bg-white top-0 z-30 items-center md:gap-0 dark:bg-gray-800'>
              <h1
                id="landing-title"
                className="ml-auto mr-auto mt-0.5 flex gap-2 text-center text-2xl font-semibold"
              >
                {convoData && convoDataKeys ? convoData[convoDataKeys[convoIdx]].title : ''}
              </h1>
              {convoUser && (<div className='my-2 flex flex-row flex-wrap justify-center items-center justify-self-center text-base'>
                {/*Conversation author*/}
                <button
                  onClick={ navigateToProfile }
                  className='flex flex-row gap-1 py-1 px-2 mx-2 items-center hover:bg-gray-200 dark:hover:bg-gray-600'
                >
                  <div
                    title={convoUser?.username}
                    style={{
                      width: 25,
                      height: 25
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
                  <button className='flex flex-row items-center gap-1 p-1 ml-0.5 hover:bg-gray-200 dark:hover:bg-gray-600' onClick={ likeConversation }>
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
                    <div>
                      {localize(lang, 'com_ui_number_of_likes', numOfLikes.toString())}
                    </div>
                  </button>
                </div>
              </div>
              )}
            </div>

            {/*Conversation messages*/}
            <div className="dark:gpt-dark-gray mb-32 h-auto w-full md:mb-48" ref={screenshotTargetRef}>
              <div className="dark:gpt-dark-gray flex h-auto flex-col items-center text-sm">
                {convoData && convoDataKeys && msgTree && convoUser ? (
                  <MultiMessage
                    key={convoData[convoDataKeys[convoIdx]].conversationId} // avoid internal state mixture
                    messageId={convoData[convoDataKeys[convoIdx]].conversationId}
                    conversation={convoData[convoDataKeys[convoIdx]]}
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
                <SwitchPage key={ 'left_switch' } switchHandler={ prevConvo } direction={ 'left' } />
                <SwitchPage key={ 'right_switch' } switchHandler={ nextConvo } direction={ 'right' } />
              </div>
            </div>
            <CSSTransition
              in={copied}
              timeout={2000}
              classNames="copied-toast"
              unmountOnExit={false}
            >
              <div className='opacity-0 invisible absolute bottom-20 text-black text-md bg-gray-200 py-1 px-3 rounded-full'>
                {localize(lang, 'com_ui_copied')}
              </div>
            </CSSTransition>
          </>
        </div>
      </div>
    </div>
  );
}