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

export default function Recommendations({ type: leaderboardType }: {type: string}) {
  const [convoIdx, setConvoIdx] = useState<number>(0);
  const [convoDataLength, setConvoDataLength] = useState<number>(1);
  const [convoData, setConvoData] = useState<TConversation[] | null>(null);
  const [msgTree, setMsgTree] = useState<TMessage[] | null>(null);
  const [user, setUser] = useState<TUser | null>(null);

  // @ts-ignore TODO: Fix anti-pattern - requires refactoring conversation store
  const { token } = useAuthContext();
  const lang = useRecoilValue(store.lang);
  const title = localize(lang, 'com_ui_recommendation');

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
      <h1
        id="landing-title"
        className="mb-3 ml-auto mr-auto mt-0.5 flex items-center justify-center gap-2 text-center text-4xl font-semibold sm:mb-2 md:mt-0.5"
      >
        {convoData ? convoData[convoIdx].title : ''}
      </h1>
      <div className="dark:gpt-dark-gray mb-32 h-auto md:mb-48" ref={screenshotTargetRef}>
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
