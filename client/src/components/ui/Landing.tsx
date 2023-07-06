import React, { useEffect, useState } from 'react';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import MultiMessage from '../Messages/MultiMessage';
import buildTree from '~/utils/buildTree';
import { useScreenshot } from '~/utils/screenshotContext.jsx';
import {
  TConversation,
  useGetRecentConversations,
  useGetMessagesByConvoId,
  useDuplicateConvoMutation,
} from '~/data-provider';
import SwitchPage from './SwitchPage';
import DuplicateConvoButton from './DuplicateConvoButton';
import store from '~/store';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';
import { cn } from '~/utils';

export default function Landing() {
  const [conversation, setConversation] = useState<TConversation>();
  const [conversationId, setConversationId] = useState<string>();
  const [messagesTree, setMessagesTree] = useState<any>();
  const [convoIdx, setConvoIdx] = useState<number>(0);
  const [convoDataLength, setConvoDataLength] = useState<number>(1);
  const [tabsValue, setTabsValue] = useState<string>("leaderboard");
  // @ts-ignore TODO: Fix anti-pattern - requires refactoring conversation store
  const title = '首页';

  const RecentConversations = useGetRecentConversations();
  
  const convoData = RecentConversations.data;
  const messages = useGetMessagesByConvoId(convoData?.length ? convoData[convoIdx].conversationId : ''); // sometimes returns a string
  const msgData = messages?.data;

  const { screenshotTargetRef } = useScreenshot();
  const { refreshConversations } = store.useConversations();
  const { switchToConversation } = store.useConversation();

  const nextConvo = () => convoIdx === convoDataLength - 1 ? setConvoIdx(0) : setConvoIdx(convoIdx + 1);
  const prevConvo = () => convoIdx === 0 ? setConvoIdx(convoDataLength - 1) : setConvoIdx(convoIdx - 1);

  const duplicateConversationMutation = useDuplicateConvoMutation();

  const duplicateHandler = () => {
    if (typeof msgData === 'string') return; // quick fix, but needs refactoring
    // const messageIds = msgData?.map((msg) => { return msg.messageId });
    duplicateConversationMutation.mutate({ conversation, msgData });
  }
  const cardStyle =
    'transition-colors shadow-md rounded-md min-w-[75px] font-normal bg-white border-black/10 hover:border-black/10 focus:border-black/10 dark:border-black/10 dark:hover:border-black/10 dark:focus:border-black/10 border dark:bg-gray-700 text-black dark:text-white';
  const defaultClasses =
    'p-2 rounded-md min-w-[75px] font-normal bg-white/[.60] dark:bg-gray-700 text-black text-xs';
  const defaultSelected = cn(
    defaultClasses,
    'font-medium data-[state=active]:text-white text-xs text-white'
  );
  const selectedTab = (val: string) => val + '-tab ' + defaultSelected;

  // Get recent conversations
  useEffect(() => {
    if (convoData?.length && msgData) {
      setConvoDataLength(convoData.length);
      setConversation(convoData[convoIdx]);
      setConversationId(convoData[convoIdx].conversationId);
      setMessagesTree(buildTree(msgData));
    }
  }, [convoData, msgData, convoIdx]);

  useEffect(() => { // Consider moving this to Conversation.jsx
    if (duplicateConversationMutation.isSuccess) {
      refreshConversations();
      switchToConversation(conversation);
    }
  })

  useDocumentTitle(title);

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto pt-0 text-sm dark:bg-gray-800">
      <div className="w-full px-6 text-gray-800 dark:text-gray-100 md:flex md:max-w-2xl md:flex-col lg:max-w-3xl">
        <div
          className={
            'flex w-full flex-wrap items-center justify-center gap-2'
          }
        >
          <Tabs 
            value={tabsValue}
            className={
              cardStyle +
              ' z-50 flex h-[40px] flex-none items-center justify-center px-0 hover:bg-slate-50 dark:hover:bg-gray-600'
            }
            onValueChange={(value) => setTabsValue(value)}
          >
            <TabsList className="bg-white/[.60] dark:bg-gray-700">
              <TabsTrigger
                value='leaderboard'
                className={`${tabsValue === 'leaderboard' ? selectedTab('creative') : defaultClasses}`}
              >
                {'排行榜'}
              </TabsTrigger>
              <TabsTrigger
                value='recommendations'
                className={`${tabsValue === 'recommendations' ? selectedTab('fast') : defaultClasses}`}
              >
                {'对话推荐'}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <h1
          id="landing-title"
          className="mb-10 ml-auto mr-auto mt-6 flex items-center justify-center gap-2 text-center text-4xl font-semibold sm:mb-16 md:mt-[10vh]"
        >
          {'看看其他用户最近都在问些什么'}
        </h1>
        <div className="dark:gpt-dark-gray mb-32 h-auto md:mb-48" ref={screenshotTargetRef}>
          <div className="dark:gpt-dark-gray flex h-auto flex-col items-center text-sm">
            <MultiMessage
              key={conversationId} // avoid internal state mixture
              messageId={conversationId}
              conversation={conversation}
              messagesTree={messagesTree}
              scrollToBottom={null}
              currentEditId={-1}
              setCurrentEditId={null}
              isSearchView={true}
              hideUser={true}
            />
            <SwitchPage key={ 'left_switch' } switchHandler={ prevConvo } direction={ 'left' } />
            <SwitchPage key={ 'right_switch' } switchHandler={ nextConvo } direction={ 'right' } />
            <DuplicateConvoButton duplicateHandler={ duplicateHandler } />
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
      </div>
    </div>
  );
}
