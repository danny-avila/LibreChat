import { useRecoilValue } from 'recoil';
import { useMessageHelpers, useLocalize, useVeraChat } from '~/hooks';
import type { TMessageProps } from '~/common';
import { Plugin } from '~/components/Messages/Content';
import MessageContent from './Content/MessageContent';
import SiblingSwitch from './SiblingSwitch';
// eslint-disable-next-line import/no-cycle
import MultiMessage from './MultiMessage';
import HoverButtons from './HoverButtons';
import SubRow from './SubRow';
import { cn } from '~/utils';
import store from '~/store';
import { useAuthStore } from '~/zustand';
import MessageInfoChip from './MessageInfoChip';
import { VERA_BLUE, VERA_TEAL } from '~/utils/constants';

export default function Message(props: TMessageProps) {
  const UsernameDisplay = useRecoilValue<boolean>(store.UsernameDisplay);
  const { user } = useAuthStore();
  const localize = useLocalize();

  const {
    ask,
    icon,
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

  const { message, siblingIdx, siblingCount, setSiblingIdx, currentEditId, setCurrentEditId } =
    props;

  if (!message) {
    return null;
  }

  const { text, children, messageId = null, isCreatedByUser, error, unfinished } = message ?? {};

  let messageLabel = '';
  if (isCreatedByUser) {
    messageLabel = UsernameDisplay ? user?.username : localize('com_user_message');
  } else {
    messageLabel = message.sender;
  }

  return (
    <>
      <div
        className="text-token-text-primary w-full border-0 bg-transparent dark:border-0 dark:bg-transparent"
        onWheel={handleScroll}
        onTouchMove={handleScroll}
      >
        <div className="m-auto justify-center p-4 py-2 text-base md:gap-6 ">
          <div className="} group mx-auto flex flex-1 gap-3 text-base md:max-w-3xl md:px-5 lg:max-w-[40rem] lg:px-1 xl:max-w-[48rem] xl:px-5">
            <div className="relative flex flex-shrink-0 flex-col items-end">
              <div>
                <div className="pt-0.5">
                  <div className="gizmo-shadow-stroke flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
                    {typeof icon === 'string' && /[^\\x00-\\x7F]+/.test(icon as string) ? (
                      <span className=" direction-rtl w-40 overflow-x-scroll">{icon}</span>
                    ) : (
                      icon
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div
              className={cn('relative flex w-full flex-col', isCreatedByUser ? '' : 'agent-turn')}
            >
              <div className="select-none font-semibold">{messageLabel}</div>
              <div className="flex-col gap-1 md:gap-3">
                <div className="flex max-w-full flex-grow flex-col gap-0">
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
                </div>
              </div>
              {/* {isLast && isSubmitting ? null : ( */}

              <SubRow
                classes={`text-xs items-center  ${isSubmitting ? 'hidden' : 'block'} h-max-content`}
              >
                <SiblingSwitch
                  siblingIdx={siblingIdx}
                  siblingCount={siblingCount}
                  setSiblingIdx={setSiblingIdx}
                />

                <div>
                  <HoverButtons
                    isEditing={edit}
                    message={message}
                    enterEdit={enterEdit}
                    isSubmitting={isSubmitting}
                    conversation={conversation ?? null}
                    regenerate={() => regenerateMessage()}
                    copyToClipboard={copyToClipboard}
                    handleContinue={handleContinue}
                    latestMessage={latestMessage}
                  />
                </div>

                {!isCreatedByUser && (
                  <>
                    <span style={{ background: '#DADCE5', height: '16px', width: 1 }} />

                    {message.model && (
                      <MessageInfoChip text={message.model} color={VERA_TEAL} bg="#30A9E51A">
                        {message.modelReason}
                      </MessageInfoChip>
                    )}

                    {message.systemMessage && (
                      <MessageInfoChip text={'System info'} color="#192C6B" bg="#192C6B1A">
                        {message.systemMessage}
                      </MessageInfoChip>
                    )}

                    <MessageInfoChip text={'Cached response'} bg="#3F5AFF1A" color={VERA_BLUE}>
                      This response was generated from Cache
                    </MessageInfoChip>
                  </>
                )}
              </SubRow>

              {/* )} */}
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
