import React, { useEffect, useState } from 'react';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import MultiMessage from '../Messages/MultiMessage';
import buildTree from '~/utils/buildTree';
import { useScreenshot } from '~/utils/screenshotContext.jsx';
import {
  TConversation,
  useGetRecentConversations,
  useGetHottestConversations,
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
import LikeIcon from '../svg/LikeIcon';
import Regenerate from '../svg/RegenerateIcon';

export default function Recommendations({ type: leaderboardType }: {type: string}) {
  const [convoIdx, setConvoIdx] = useState<number>(0);
  const [convoDataLength, setConvoDataLength] = useState<number>(1);
  const [convoData, setConvoData] = useState<TConversation[] | null>(null);
  const [msgTree, setMsgTree] = useState<TMessage[] | null>(null);
  const [user, setUser] = useState<TUser | null>(null);

  const [liked, setLiked] = useState<boolean>(false);

  // @ts-ignore TODO: Fix anti-pattern - requires refactoring conversation store
  const { token } = useAuthContext();
  const lang = useRecoilValue(store.lang);
  const title = localize(lang, 'com_ui_recommendation');
  const navigate = useNavigate();

  const navigateToProfile = () => {
    navigate(`/profile/${user?.id}`);
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

  const recentConversations = useGetRecentConversations();
  const hottestConversations = useGetHottestConversations();

  const { screenshotTargetRef } = useScreenshot();

  const nextConvo = () => convoIdx === convoDataLength - 1 ? setConvoIdx(0) : setConvoIdx(convoIdx + 1);
  const prevConvo = () => convoIdx === 0 ? setConvoIdx(convoDataLength - 1) : setConvoIdx(convoIdx - 1);

  // Get recent conversations
  useEffect(() => {
    if (recentConversations.isSuccess && hottestConversations.isSuccess) {
      const recommendations = ((leaderboardType === 'recent') ? recentConversations : hottestConversations);
      setConvoData(recommendations.data);
      setConvoDataLength(recommendations.data.length);
    }
  }, [recentConversations.isSuccess, hottestConversations.isSuccess]);

  useEffect(() => {
    if (convoData) {
      fetchMessagesByConvoId(convoData[convoIdx].conversationId);
      fetchConvoUser(convoData[convoIdx].user);
    }
  }, [convoData, convoIdx]);

  useDocumentTitle(title);

  return (
    <>
      <div className='grid grid-row grid-cols-4 w-full sticky bg-white top-0 z-30 items-center'>
        <div className='w-4/5 grid grid-col grid-cols-2 items-center gap-2 col-span-1 justify-self-end hover:underline'>
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
        <h1
          id="landing-title"
          className="col-span-2 mb-3 ml-auto mr-auto mt-0.5 flex gap-2 text-center text-3xl font-semibold sm:mb-2 md:mt-0.5"
        >
          {convoData ? convoData[convoIdx].title : ''}
        </h1>
        <div className='flex flex-row gap-2 col-span-1 justify-self-start'>
          <button>
            <Regenerate />
          </button>
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
          <button>
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
          {/* <DuplicateConvoButton duplicateHandler={ duplicateHandler } /> */}
        </div>
      </div>
      {/* {!showingTemplates && (
        <div className="mt-8 mb-4 flex flex-col items-center gap-3.5 md:mt-16">
          <button
            onClick={showTemplates}
            className="btn btn-neutral justify-center gap-2 border-0 md:border"
          >
            <ChatIcon />
            Show Prompt Templates
          </button>
        </div>
      )}
      {!!showingTemplates && <Templates showTemplates={showTemplates}/>} */}
      {/* <div className="group h-32 w-full flex-shrink-0 dark:border-gray-900/50 dark:bg-gray-800 md:h-48" /> */}
    </>
  );
}
