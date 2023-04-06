import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRecoilValue, useSetRecoilState, useResetRecoilState } from 'recoil';
import copy from 'copy-to-clipboard';
import SubRow from './Content/SubRow';
import Content from './Content/Content';
import MultiMessage from './MultiMessage';
import HoverButtons from './HoverButtons';
import SiblingSwitch from './SiblingSwitch';
import { fetchById } from '~/utils/fetchers';
import getIcon from '~/utils/getIcon';
import { useMessageHandler } from '~/utils/handleSubmit';
import { cn } from '~/utils/';

import store from '~/store';

export default function Message({
  conversation,
  message,
  scrollToBottom,
  currentEditId,
  setCurrentEditId,
  siblingIdx,
  siblingCount,
  setSiblingIdx
}) {
  const isSubmitting = useRecoilValue(store.isSubmitting);
  const setLatestMessage = useSetRecoilState(store.latestMessage);
  // const { model, chatGptLabel, promptPrefix } = conversation;
  const [abortScroll, setAbort] = useState(false);
  const { text, searchResult, isCreatedByUser, error, submitting } = message;
  const textEditor = useRef(null);
  const last = !message?.children?.length;
  const edit = message.messageId == currentEditId;
  const { ask, regenerate } = useMessageHandler();
  const { switchToConversation } = store.useConversation();
  const blinker = submitting && isSubmitting;

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

  const enterEdit = cancel => setCurrentEditId(cancel ? -1 : message.messageId);

  const handleWheel = () => {
    if (blinker) {
      setAbort(true);
    } else {
      setAbort(false);
    }
  };

  const props = {
    className:
      'w-full border-b border-black/10 dark:border-gray-900/50 text-gray-800 bg-white dark:text-gray-100 group dark:bg-gray-800'
  };

  const icon = getIcon({
    ...conversation,
    ...message
  });

  if (!isCreatedByUser)
    props.className =
      'w-full border-b border-black/10 bg-gray-50 dark:border-gray-900/50 text-gray-800 dark:text-gray-100 group bg-gray-100 dark:bg-[#444654]';

  if (message.bg && searchResult) {
    props.className = message.bg.split('hover')[0];
    props.titleclass = message.bg.split(props.className)[1] + ' cursor-pointer';
  }

  const resubmitMessage = () => {
    const text = textEditor.current.innerText;

    ask({
      text,
      parentMessageId: message?.parentMessageId,
      conversationId: message?.conversationId
    });

    setSiblingIdx(siblingCount - 1);
    enterEdit(true);
  };

  const regenerateMessage = () => {
    if (!isSubmitting && !message?.isCreatedByUser) regenerate(message);
  };

  const copyToClipboard = () => {
    copy(message?.text);
  };

  const clickSearchResult = async () => {
    if (!searchResult) return;
    const convoResponse = await fetchById('convos', message.conversationId);
    const convo = convoResponse.data;

    switchToConversation(convo);
  };

  return (
    <>
      <div
        {...props}
        onWheel={handleWheel}
      >
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
              {error ? (
                <div className="flex flex min-h-[20px] flex-grow flex-col items-start gap-2 gap-4  text-red-500">
                  <div className="rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-100">
                    {`An error occurred. Please try again in a few moments.\n\nError message: ${text}`}
                  </div>
                </div>
              ) : edit ? (
                <div className="flex min-h-[20px] flex-grow flex-col items-start gap-4 ">
                  {/* <div className={`${blinker ? 'result-streaming' : ''} markdown prose dark:prose-invert light w-full break-words`}> */}

                  <div
                    className="markdown prose dark:prose-invert light w-full break-words border-none focus:outline-none"
                    contentEditable={true}
                    ref={textEditor}
                    suppressContentEditableWarning={true}
                  >
                    {text}
                  </div>
                  <div className="mt-2 flex w-full justify-center text-center">
                    <button
                      className="btn btn-primary relative mr-2"
                      disabled={isSubmitting}
                      onClick={resubmitMessage}
                    >
                      Save & Submit
                    </button>
                    <button
                      className="btn btn-neutral relative"
                      onClick={() => enterEdit(true)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    'flex min-h-[20px] flex-grow flex-col items-start gap-4 ',
                    isCreatedByUser ? 'whitespace-pre-wrap' : ''
                  )}
                >
                  {/* <div className={`${blinker ? 'result-streaming' : ''} markdown prose dark:prose-invert light w-full break-words`}> */}
                  <div className="markdown prose dark:prose-invert light w-full break-words">
                    {!isCreatedByUser ? (
                      <>
                        <Content content={text} />
                      </>
                    ) : (
                      <>{text}</>
                    )}
                  </div>
                </div>
              )}
            </div>
            <HoverButtons
              isEditting={edit}
              isSubmitting={isSubmitting}
              message={message}
              conversation={conversation}
              enterEdit={() => enterEdit()}
              regenerate={() => regenerateMessage()}
              copyToClipboard={() => copyToClipboard()}
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
