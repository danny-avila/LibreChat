import React, { useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import type { TMessageContentParts } from 'librechat-data-provider';
import type { TMessageProps, TMessageIcon } from '~/common';
import MessageIcon from '~/components/Chat/Messages/MessageIcon';
import { useMessageHelpers, useLocalize } from '~/hooks';
import ContentParts from './Content/ContentParts';
import SiblingSwitch from './SiblingSwitch';

import MultiMessage from './MultiMessage';
import HoverButtons from './HoverButtons';
import SubRow from './SubRow';
import { cn } from '~/utils';
import store from '~/store';

export default function Message(props: TMessageProps) {
  const localize = useLocalize();
  const { message, siblingIdx, siblingCount, setSiblingIdx, currentEditId, setCurrentEditId } =
    props;

  const {
    edit,
    index,
    agent,
    isLast,
    enterEdit,
    assistant,
    handleScroll,
    conversation,
    isSubmitting,
    latestMessage,
    handleContinue,
    copyToClipboard,
    regenerateMessage,
  } = useMessageHelpers(props);

  const fontSize = useRecoilValue(store.fontSize);
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
  const { children, messageId = null, isCreatedByUser } = message ?? {};

  const name = useMemo(() => {
    let result = '';
    if (isCreatedByUser === true) {
      result = localize('com_user_message');
    } else if (assistant) {
      result = assistant.name ?? localize('com_ui_assistant');
    } else if (agent) {
      result = agent.name ?? localize('com_ui_agent');
    }

    return result;
  }, [assistant, agent, isCreatedByUser, localize]);

  const iconData: TMessageIcon = useMemo(
    () => ({
      endpoint: message?.endpoint ?? conversation?.endpoint,
      model: message?.model ?? conversation?.model,
      iconURL: message?.iconURL ?? conversation?.iconURL,
      modelLabel: name,
      isCreatedByUser: message?.isCreatedByUser,
    }),
    [
      name,
      conversation?.endpoint,
      conversation?.iconURL,
      conversation?.model,
      message?.model,
      message?.iconURL,
      message?.endpoint,
      message?.isCreatedByUser,
    ],
  );

  if (!message) {
    return null;
  }

  const baseClasses = {
    common: 'group mx-auto flex flex-1 gap-3 transition-all duration-300 transform-gpu',
    chat: maximizeChatSpace
      ? 'w-full max-w-full md:px-5 lg:px-1 xl:px-5'
      : 'md:max-w-[47rem] xl:max-w-[55rem]',
  };

  return (
    <>
      <div
        className="w-full border-0 bg-transparent dark:border-0 dark:bg-transparent"
        onWheel={handleScroll}
        onTouchMove={handleScroll}
      >
        <div className="m-auto justify-center p-4 py-2 md:gap-6">
          <div
            id={messageId}
            aria-label={`message-${message.depth}-${messageId}`}
            className={cn(baseClasses.common, baseClasses.chat, 'message-render')}
          >
            <div className="relative flex flex-shrink-0 flex-col items-center">
              <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full pt-0.5">
                <MessageIcon iconData={iconData} assistant={assistant} agent={agent} />
              </div>
            </div>
            <div
              className={cn(
                'relative flex w-11/12 flex-col',
                isCreatedByUser ? 'user-turn' : 'agent-turn',
              )}
            >
              <h2 className={cn('select-none font-semibold text-text-primary', fontSize)}>
                {name}
              </h2>
              <div className="flex flex-col gap-1">
                <div className="flex max-w-full flex-grow flex-col gap-0">
                  <ContentParts
                    edit={edit}
                    isLast={isLast}
                    enterEdit={enterEdit}
                    siblingIdx={siblingIdx}
                    messageId={message.messageId}
                    isSubmitting={isSubmitting}
                    setSiblingIdx={setSiblingIdx}
                    attachments={message.attachments}
                    isCreatedByUser={message.isCreatedByUser}
                    conversationId={conversation?.conversationId}
                    content={message.content as Array<TMessageContentParts | undefined>}
                  />
                </div>
                {isLast && isSubmitting ? (
                  <div className="mt-1 h-[27px] bg-transparent" />
                ) : (
                  <SubRow classes="text-xs">
                    <SiblingSwitch
                      siblingIdx={siblingIdx}
                      siblingCount={siblingCount}
                      setSiblingIdx={setSiblingIdx}
                    />
                    <HoverButtons
                      index={index}
                      isEditing={edit}
                      message={message}
                      enterEdit={enterEdit}
                      isSubmitting={isSubmitting}
                      conversation={conversation ?? null}
                      regenerate={() => regenerateMessage()}
                      copyToClipboard={copyToClipboard}
                      handleContinue={handleContinue}
                      latestMessage={latestMessage}
                      isLast={isLast}
                    />
                  </SubRow>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <MultiMessage
        key={messageId}
        messageId={messageId}
        conversation={conversation}
        messagesTree={children ?? []}
        currentEditId={currentEditId}
        setCurrentEditId={setCurrentEditId}
      />
    </>
  );
}
