import { useRecoilValue } from 'recoil';
import type { TMessageProps } from '~/common';
import Icon from '~/components/Chat/Messages/MessageIcon';
import { useMessageHelpers, useLocalize } from '~/hooks';
import ContentParts from './Content/ContentParts';
import SiblingSwitch from './SiblingSwitch';
// eslint-disable-next-line import/no-cycle
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
    ask,
    edit,
    index,
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
  const { content, children, messageId = null, isCreatedByUser, error, unfinished } = message ?? {};

  if (!message) {
    return null;
  }

  return (
    <>
      <div
        className="text-token-text-primary w-full border-0 bg-transparent dark:border-0 dark:bg-transparent"
        onWheel={handleScroll}
        onTouchMove={handleScroll}
      >
        <div className="m-auto justify-center p-4 py-2 md:gap-6 ">
          <div className="group mx-auto flex flex-1 gap-3 md:max-w-3xl md:px-5 lg:max-w-[40rem] lg:px-1 xl:max-w-[48rem] xl:px-5">
            <div className="relative flex flex-shrink-0 flex-col items-end">
              <div>
                <div className="pt-0.5">
                  <div className="shadow-stroke flex h-6 w-6 items-center justify-center overflow-hidden rounded-full">
                    <Icon message={message} conversation={conversation} assistant={assistant} />
                  </div>
                </div>
              </div>
            </div>
            <div
              className={cn(
                'relative flex w-full flex-col',
                isCreatedByUser === true ? '' : 'agent-turn',
              )}
            >
              <div className={cn('select-none font-semibold', fontSize)}>
                {isCreatedByUser === true
                  ? localize('com_user_message')
                  : (assistant && assistant.name) ?? localize('com_ui_assistant')}
              </div>
              <div className="flex-col gap-1 md:gap-3">
                <div className="flex max-w-full flex-grow flex-col gap-0">
                  <ContentParts
                    ask={ask}
                    edit={edit}
                    isLast={isLast}
                    content={content ?? []}
                    message={message}
                    messageId={messageId}
                    enterEdit={enterEdit}
                    error={!!(error ?? false)}
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
