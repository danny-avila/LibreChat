/* eslint-disable react-hooks/exhaustive-deps */
import { useGetConversationByIdQuery } from 'librechat-data-provider';
import { useState, useEffect } from 'react';
import { useSetRecoilState } from 'recoil';
import copy from 'copy-to-clipboard';
import { Plugin, SubRow, MessageContent } from './Content';
import MultiMessage from './MultiMessage';
import HoverButtons from './HoverButtons';
import SiblingSwitch from './SiblingSwitch';
import { getIcon } from '~/components/Endpoints';
import { useMessageHandler } from '~/hooks';
import store from '~/store';

export default function Message({
  conversation,
  message,
  scrollToBottom,
  currentEditId,
  setCurrentEditId,
  siblingIdx,
  siblingCount,
  setSiblingIdx,
}) {
  const { text, searchResult, isCreatedByUser, error, submitting, unfinished } = message;
  const setLatestMessage = useSetRecoilState(store.latestMessage);
  const [abortScroll, setAbort] = useState(false);
  const last = !message?.children?.length;
  const edit = message.messageId == currentEditId;
  const { isSubmitting, ask, regenerate, handleContinue } = useMessageHandler();
  const { switchToConversation } = store.useConversation();
  const blinker = submitting && isSubmitting;
  const getConversationQuery = useGetConversationByIdQuery(message.conversationId, {
    enabled: false,
  });

  // debugging
  // useEffect(() => {
  //   console.log('isSubmitting:', isSubmitting);
  //   console.log('unfinished:', unfinished);
  // }, [isSubmitting, unfinished]);

  useEffect(() => {
    if (blinker && !abortScroll) {
      scrollToBottom();
    }
  }, [isSubmitting, blinker, text, scrollToBottom]);

  useEffect(() => {
    if (last) {
      setLatestMessage({ ...message });
    }
  }, [last, message]);

  const enterEdit = (cancel) => setCurrentEditId(cancel ? -1 : message.messageId);

  const handleWheel = () => {
    if (blinker) {
      setAbort(true);
    } else {
      setAbort(false);
    }
  };

  const props = {
    className:
      'w-full border-b border-black/10 dark:border-gray-900/50 text-gray-800 bg-white dark:text-gray-100 group dark:bg-gray-800',
  };

  const icon = getIcon({
    ...conversation,
    ...message,
    model: message?.model || conversation?.model,
  });

  if (!isCreatedByUser) {
    props.className =
      'w-full border-b border-black/10 bg-gray-50 dark:border-gray-900/50 text-gray-800 dark:text-gray-100 group bg-gray-100 dark:bg-gray-1000';
  }

  if (message.bg && searchResult) {
    props.className = message.bg.split('hover')[0];
    props.titleclass = message.bg.split(props.className)[1] + ' cursor-pointer';
  }

  const regenerateMessage = () => {
    if (!isSubmitting && !message?.isCreatedByUser) {
      regenerate(message);
    }
  };

  const copyToClipboard = (setIsCopied) => {
    setIsCopied(true);
    copy(message?.text);

    setTimeout(() => {
      setIsCopied(false);
    }, 3000);
  };

  const clickSearchResult = async () => {
    if (!searchResult) {
      return;
    }
    getConversationQuery.refetch(message.conversationId).then((response) => {
      switchToConversation(response.data);
    });
  };

  return (
    <>
      <div {...props} onWheel={handleWheel}>
        <div className="relative m-auto flex gap-4 p-4 text-base md:max-w-2xl md:gap-6 md:py-6 lg:max-w-2xl lg:px-0 xl:max-w-3xl">
          <div className="relative flex h-[30px] w-[30px] flex-col items-end text-right text-xs md:text-sm">
            {typeof icon === 'string' && icon.match(/[^\\x00-\\x7F]+/) ? (
              <span className=" direction-rtl w-40 overflow-x-scroll">{icon}</span>
            ) : (
              icon
            )}
            <div className="sibling-switch invisible absolute left-0 top-2 -ml-4 flex -translate-x-full items-center justify-center gap-1 text-xs group-hover:visible">
              <SiblingSwitch
                siblingIdx={siblingIdx}
                siblingCount={siblingCount}
                setSiblingIdx={setSiblingIdx}
              />
            </div>
          </div>
          <div className="relative flex w-[calc(100%-50px)] flex-col gap-1  md:gap-3 lg:w-[calc(100%-115px)]">
            {searchResult && (
              <SubRow
                classes={props.titleclass + ' rounded'}
                subclasses="switch-result pl-2 pb-2"
                onClick={clickSearchResult}
              >
                <strong>{`${message.title} | ${message.sender}`}</strong>
              </SubRow>
            )}
            <div className="flex flex-grow flex-col gap-3">
              {message.plugin && <Plugin plugin={message.plugin} />}
              {/* Message content goes here */}
              {/*
              type TInitialProps = {
                text: string;
                edit: boolean;
                error: boolean;
                unfinished: boolean;
                isSubmitting: boolean;
              };
              type TAdditionalProps = {
                ask: TAskFunction;
                message: TMessage;
                isCreatedByUser: boolean;
                enterEdit: (cancel: boolean) => void;
                setSiblingIdx: () => void;
              };
              */}
              <MessageContent
                ask={ask}
                text={text}
                edit={edit}
                error={error}
                message={message}
                enterEdit={enterEdit}
                unfinished={unfinished}
                isSubmitting={isSubmitting}
                isCreatedByUser={isCreatedByUser}
                setSiblingIdx={() => setSiblingIdx(siblingIdx - 1)}
              />
            </div>
            <HoverButtons
              isEditing={edit}
              isSubmitting={isSubmitting}
              message={message}
              conversation={conversation}
              enterEdit={() => enterEdit()}
              regenerate={() => regenerateMessage()}
              handleContinue={handleContinue}
              copyToClipboard={copyToClipboard}
            />
            <SubRow subclasses="switch-container">
              <SiblingSwitch
                siblingIdx={siblingIdx}
                siblingCount={siblingCount}
                setSiblingIdx={setSiblingIdx}
              />
            </SubRow>
          </div>
        </div>
      </div>
      <MultiMessage
        messageId={message.messageId}
        conversation={conversation}
        messagesTree={message.children}
        scrollToBottom={scrollToBottom}
        currentEditId={currentEditId}
        setCurrentEditId={setCurrentEditId}
      />
    </>
  );
}
