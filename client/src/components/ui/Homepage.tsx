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
} from '@librechat/data-provider';
import SwitchPage from './SwitchPage';
import store from '~/store';
import { localize } from '~/localization/Translation';
import { useRecoilValue } from 'recoil';
import { useAuthContext } from '~/hooks/AuthContext';
import { Spinner } from '../svg';
import { useNavigate } from 'react-router-dom';

export default function Homepage() {
  const [tabValue, setTabValue] = useRecoilState<string>(store.tabValue);

  const [convoIdx, setConvoIdx] = useState<number>(0);
  const [convoDataLength, setConvoDataLength] = useState<number>(1);
  const [convoData, setConvoData] = useState<TConversation[] | null>(null);
  const [msgTree, setMsgTree] = useState<TMessage[] | null>(null);
  const [user, setUser] = useState<TUser | null>(null);
  const [lastLeaderboardType, setLastLeaderboardType] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const [liked, setLiked] = useState<boolean>(false);

  // @ts-ignore TODO: Fix anti-pattern - requires refactoring conversation store
  const { token } = useAuthContext();
  const lang = useRecoilValue(store.lang);
  const title = localize(lang, 'com_ui_recommendation');
  const navigate = useNavigate();

  const navigateToProfile = () => {
    navigate(`/profile/${user?.id}`);
  }

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
        setConvoDataLength(responseObject.length);
      }
    } catch (error) {
      console.log(error);
    }
  }

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
        setConvoDataLength(responseObject.length);
      }
    } catch (error) {
      console.log(error);
    }
  }

  async function fetchRecommendations() {
    const last = Number(window.localStorage.getItem('lastFetchTime'));
    const currentTime = Date.now();

    if ((currentTime - last) > 30000) {
      setConvoData(null);
      setConvoIdx(0);

      fetchRecentConversations();
      fetchHottestConversations();

      window.localStorage.setItem('lastFetchTime', currentTime.toString());
    } else {
      if (tabValue === lastLeaderboardType) return;

      setConvoData(null);
      setConvoIdx(0);

      let conversations: string | null = null;

      if (tabValue === 'recent') {
        conversations = window.localStorage.getItem('recentConversations');
      } else if (tabValue === 'hottest') {
        conversations = window.localStorage.getItem('hottestConversations');
      }

      if (conversations) {
        const convoObject = JSON.parse(conversations);
        setConvoData(convoObject);
        setConvoDataLength(convoObject.length);
      }
    }

    setLastLeaderboardType(tabValue);
  }

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

  async function fetchConvoUser(id: string | undefined) {
    setUser(null);
    try {
      const response = await fetch(`/api/user/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const responseObject = await response.json();
      setUser(responseObject);
    } catch (error) {
      console.log(error);
    }
  }

  const { screenshotTargetRef } = useScreenshot();

  const nextConvo = () => convoIdx === convoDataLength - 1 ? setConvoIdx(0) : setConvoIdx(convoIdx + 1);
  const prevConvo = () => convoIdx === 0 ? setConvoIdx(convoDataLength - 1) : setConvoIdx(convoIdx - 1);
  const copyShareLinkHandler = () => {
    if (copied) return;
    if (convoData) {
      navigator.clipboard.writeText(window.location.host + `/chat/share/${convoData[convoIdx].conversationId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Get recent conversations
  useEffect(() => {
    if (token) {
      fetchRecommendations();
    }
  }, [token]);

  useEffect(() => {
    if (convoData) {
      fetchMessagesByConvoId(convoData[convoIdx].conversationId);
      fetchConvoUser(convoData[convoIdx].user);
    }
  }, [convoData, convoIdx]);

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
                {'最新对话'}
              </div>
            </TabsTrigger>
            <TabsTrigger
              value='hottest'
              className={`${tabValue === 'hottest' ? selectedTab('balanced') : defaultClasses}`}
            >
              <div onClick={ fetchRecommendations }>
                {'热门对话'}
              </div>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex h-full flex-col items-center overflow-y-auto pt-0 text-sm dark:bg-gray-800">
        <div className="flex flex-col items-center w-full px-6 text-gray-800 dark:text-gray-100 md:flex md:max-w-2xl md:flex-col lg:max-w-5xl">
          <>
            <div className='grid grid-row gap-1 w-full sticky bg-white top-0 z-30 items-center md:gap-0'>
              <h1
                id="landing-title"
                className="md:mb-3 ml-auto mr-auto mt-0.5 flex gap-2 text-center text-3xl font-semibold sm:mb-2 md:mt-0.5"
              >
                {convoData ? convoData[convoIdx].title : ''}
              </h1>
              <div className='my-2 flex flex-row justify-center items-center gap-2 md:my-0'>
                <div className='flex flex-row justify-center items-center gap-2 md:mb-2 hover:underline'>
                  {user && (
                    <>
                      <button
                        title={user?.username}
                        style={{
                          width: 30,
                          height: 30
                        }}
                        className={'justify-self-end col-span-1 relative flex items-center justify-center'}
                        onClick={ navigateToProfile }
                      >
                        <img
                          className="rounded-sm"
                          src={
                            user?.avatar ||
                            `https://api.dicebear.com/6.x/initials/svg?seed=${user?.name}&fontFamily=Verdana&fontSize=36`
                          }
                          alt="avatar"
                        />
                      </button>
                      <button
                        onClick={ navigateToProfile }
                        className='justify-self-start col-span-1'
                      >
                        {user?.username}
                      </button>
                    </>
                  )}
                </div>
                <button>
                  <svg
                    onClick={() => {setLiked(!liked)}}
                    stroke="currentColor"
                    fill={liked ? 'currentColor' : 'none'}
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 hover:text-black ml-1"
                    height="1em"
                    width="1em"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                  </svg>
                </button>
                <button onClick={ copyShareLinkHandler }>
                  <svg className="h-4 w-4" width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <g id="Communication / Share_iOS_Export">
                      <path id="Vector" d="M9 6L12 3M12 3L15 6M12 3V13M7.00023 10C6.06835 10 5.60241 10 5.23486 10.1522C4.74481 10.3552 4.35523 10.7448 4.15224 11.2349C4 11.6024 4 12.0681 4 13V17.8C4 18.9201 4 19.4798 4.21799 19.9076C4.40973 20.2839 4.71547 20.5905 5.0918 20.7822C5.5192 21 6.07899 21 7.19691 21H16.8036C17.9215 21 18.4805 21 18.9079 20.7822C19.2842 20.5905 19.5905 20.2839 19.7822 19.9076C20 19.4802 20 18.921 20 17.8031V13C20 12.0681 19.9999 11.6024 19.8477 11.2349C19.6447 10.7448 19.2554 10.3552 18.7654 10.1522C18.3978 10 17.9319 10 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </g>
                  </svg>
                </button>
              </div>
            </div>
            <div className="dark:gpt-dark-gray mb-32 h-auto w-full md:mb-48" ref={screenshotTargetRef}>
              <div className="dark:gpt-dark-gray flex h-auto flex-col items-center text-sm">
                {convoData && msgTree && user ? (
                  <MultiMessage
                    key={convoData[convoIdx].conversationId} // avoid internal state mixture
                    messageId={convoData[convoIdx].conversationId}
                    conversation={convoData[convoIdx]}
                    messagesTree={msgTree}
                    scrollToBottom={null}
                    currentEditId={-1}
                    setCurrentEditId={null}
                    isSearchView={true}
                    name={user?.name}
                    userId={user?.id}
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