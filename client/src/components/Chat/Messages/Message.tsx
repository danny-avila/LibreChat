import { useRecoilValue } from 'recoil';
import { useAuthContext, useMessageHelpers, useLocalize } from '~/hooks';
import type { TMessageProps } from '~/common';
import Icon from '~/components/Chat/Messages/MessageIcon';
import { Plugin } from '~/components/Messages/Content';
import MessageContent from './Content/MessageContent';
import SiblingSwitch from './SiblingSwitch';
// eslint-disable-next-line import/no-cycle
import MultiMessage from './MultiMessage';
import HoverButtons from './HoverButtons';
import SubRow from './SubRow';
import { cn } from '~/utils';
import store from '~/store';
import { useState } from 'react';

export default function Message(props: TMessageProps) {
  const UsernameDisplay = useRecoilValue<boolean>(store.UsernameDisplay);
  const { user } = useAuthContext();
  const localize = useLocalize();

  const {
    ask,
    edit,
    isLast,
    enterEdit,
    handleScroll,
    conversation,
    isSubmitting,
    latestMessage,
    handleContinue,
    copyToClipboard,
    regenerateMessage,
  } = useMessageHelpers(props);

  const [isForking, setIsForking] = useState<boolean>(false);

  const { message, siblingIdx, siblingCount, setSiblingIdx, currentEditId, setCurrentEditId } =
    props;

  if (!message) {
    return null;
  }

  const { text, children, messageId = null, isCreatedByUser, error, unfinished } = message ?? {};

  let messageLabel = '';
  if (isCreatedByUser) {
    messageLabel = UsernameDisplay ? user?.name || user?.username : localize('com_user_message');
  } else {
    messageLabel = message.sender;
  }

  return (
    <>
      <div
        className="text-token-text-primary group w-full"
        onWheel={handleScroll}
        onTouchMove={handleScroll}
      >
        <div className="m-auto px-3 py-2 text-base md:px-4 md:px-5 lg:px-1 xl:px-5">
          <div className="mx-auto flex flex-1 gap-3 gap-4 text-base md:max-w-3xl md:gap-6 lg:max-w-[40rem] xl:max-w-[48rem]">
            {isCreatedByUser ? (
              <div className="mx-auto flex flex-1 gap-3 gap-4 text-base md:max-w-3xl md:gap-6 lg:max-w-[40rem] xl:max-w-[48rem]">
                <div className="relative flex w-full min-w-0 flex-col">
                  <div className="flex-col gap-1 md:gap-3">
                    <div className="flex max-w-full flex-grow flex-col">
                      {edit ? (
                        <MessageContent
                          ask={ask}
                          edit={edit}
                          isLast={isLast}
                          text={text ?? ''}
                          message={message}
                          enterEdit={enterEdit}
                          error={!!error}
                          isSubmitting={isSubmitting}
                          unfinished={unfinished ?? false}
                          isCreatedByUser={isCreatedByUser ?? true}
                          siblingIdx={siblingIdx ?? 0}
                          setSiblingIdx={
                            setSiblingIdx ??
                            (() => {
                              return;
                            })
                          }
                        />
                      ) : (
                        <div className="text-message flex min-h-[20px] w-full flex-col items-start items-end gap-2 overflow-x-auto">
                          <div className="flex w-full flex-col items-end gap-1 rtl:items-start">
                            <div className="group/text-message relative max-w-[90%] rounded-3xl bg-[#f4f4f4] px-5 py-2.5 dark:bg-gray-700">
                              {/* Legacy Plugins */}
                              {message?.plugin && <Plugin plugin={message?.plugin} />}
                              <MessageContent
                                ask={ask}
                                edit={edit}
                                isLast={isLast}
                                text={text ?? ''}
                                message={message}
                                enterEdit={enterEdit}
                                error={!!error}
                                isSubmitting={isSubmitting}
                                unfinished={unfinished ?? false}
                                isCreatedByUser={isCreatedByUser ?? true}
                                siblingIdx={siblingIdx ?? 0}
                                setSiblingIdx={
                                  setSiblingIdx ??
                                  (() => {
                                    return;
                                  })
                                }
                              />
                              <div
                                className={cn(
                                  'absolute bottom-0 right-full top-0 -mr-3.5 hidden pr-5 pt-1 md:group-hover/text-message:block',
                                  {
                                    'md:block': edit || isForking,
                                  },
                                )}
                              >
                                {isLast && isSubmitting ? null : (
                                  <SubRow classes="text-xs">
                                    <HoverButtons
                                      setIsForking={setIsForking}
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
                      )}
                    </div>
                    <div className="mr-1 mt-1 flex flex-row-reverse empty:hidden">
                      <div className={cn('flex items-center justify-start rounded-xl p-1')}>
                        {isLast && isSubmitting ? null : (
                          <SubRow classes="text-xs flex-wrap">
                            <SiblingSwitch
                              siblingIdx={siblingIdx}
                              siblingCount={siblingCount}
                              setSiblingIdx={setSiblingIdx}
                            />
                            <div className="md:hidden">
                              <HoverButtons
                                setIsForking={setIsForking}
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
                                flat={true}
                              />
                            </div>
                          </SubRow>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="relative flex flex-shrink-0 flex-col items-end">
                  <div>
                    <div className="pt-0.5">
                      <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border dark:border-gray-600">
                        <div className="relative flex">
                          <Icon message={message} conversation={conversation} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="agent-turn relative flex w-full min-w-0 flex-col">
                  <div className="flex-col gap-1 md:gap-3">
                    <div className="flex max-w-full flex-grow flex-col">
                      <div
                        data-message-author-role="assistant"
                        dir="auto"
                        className="text-message flex min-h-[20px] w-full flex-col items-start items-end gap-2 overflow-x-auto"
                      >
                        <div className="flex w-full flex-col gap-1 first:pt-[3px]">
                          {message?.plugin && <Plugin plugin={message?.plugin} />}
                          <MessageContent
                            ask={ask}
                            edit={edit}
                            isLast={isLast}
                            text={text ?? ''}
                            message={message}
                            enterEdit={enterEdit}
                            error={!!error}
                            isSubmitting={isSubmitting}
                            unfinished={unfinished ?? false}
                            isCreatedByUser={isCreatedByUser ?? true}
                            siblingIdx={siblingIdx ?? 0}
                            setSiblingIdx={
                              setSiblingIdx ??
                              (() => {
                                return;
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                    <div className="-ml-3 mt-3 flex gap-3 empty:hidden">
                      <div
                        className={cn({
                          'flex items-center justify-start rounded-xl p-1': isLast,
                          'bg-token-main-surface-primary -mt-1 items-center justify-start rounded-xl p-1 md:absolute md:hidden md:border md:group-hover:block md:dark:border-gray-600':
                            !isLast,
                          'md:block': edit || isForking,
                        })}
                      >
                        <div className="flex items-center">
                          {isLast && isSubmitting ? null : (
                            <SubRow classes="text-xs flex-wrap">
                              <SiblingSwitch
                                siblingIdx={siblingIdx}
                                siblingCount={siblingCount}
                                setSiblingIdx={setSiblingIdx}
                              />
                              <HoverButtons
                                setIsForking={setIsForking}
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
                    <div className="pr-2 lg:pr-0"></div>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="mx-auto flex flex-1 gap-3 gap-4 text-base md:max-w-3xl md:gap-6 lg:max-w-[40rem] xl:max-w-[48rem]"></div>
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
