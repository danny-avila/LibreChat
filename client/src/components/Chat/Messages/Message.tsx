/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from 'react';
import copy from 'copy-to-clipboard';
import { useRecoilValue } from 'recoil';
import { Plugin } from '~/components/Messages/Content';
import MessageContent from './Content/MessageContent';
import { Icon } from '~/components/Endpoints';
import SiblingSwitch from './SiblingSwitch';
import type { TMessageProps } from '~/common';
import { useChatContext } from '~/Providers';
// eslint-disable-next-line import/no-cycle
import MultiMessage from './MultiMessage';
import HoverButtons from './HoverButtons';
import SubRow from './SubRow';
import { cn } from '~/utils';
import store from '~/store';
import Error from '~/components/Messages/Content/Error';

export default function Message(props: TMessageProps) {
  const synth = window.speechSynthesis;
  const autoScroll = useRecoilValue(store.autoScroll);
  const {
    message,
    scrollToBottom,
    currentEditId,
    setCurrentEditId,
    siblingIdx,
    siblingCount,
    setSiblingIdx,
  } = props;

  const {
    ask,
    regenerate,
    abortScroll,
    isSubmitting,
    conversation,
    setAbortScroll,
    handleContinue,
    latestMessage,
    setLatestMessage,
  } = useChatContext();

  const { conversationId } = conversation ?? {};

  const { text, children, messageId = null, isCreatedByUser, error, unfinished } = message ?? {};

  const isLast = !children?.length;
  const edit = messageId === currentEditId;

  useEffect(() => {
    if (isSubmitting && scrollToBottom && !abortScroll) {
      scrollToBottom();
    }
  }, [isSubmitting, text, scrollToBottom, abortScroll]);

  useEffect(() => {
    if (scrollToBottom && autoScroll && conversationId !== 'new') {
      scrollToBottom();
    }
  }, [autoScroll, conversationId, scrollToBottom]);

  useEffect(() => {
    if (!message) {
      return;
    } else if (isLast) {
      setLatestMessage({ ...message });
    }
  }, [isLast, message, setLatestMessage]);

  if (!message) {
    return null;
  }

  const enterEdit = (cancel?: boolean) =>
    setCurrentEditId && setCurrentEditId(cancel ? -1 : messageId);

  const handleScroll = () => {
    if (isSubmitting) {
      setAbortScroll(true);
    } else {
      setAbortScroll(false);
    }
  };

  // const commonClasses =
  //   'w-full border-b text-gray-800 group border-black/10 dark:border-gray-900/50 dark:text-gray-100 dark:border-none';
  // const uniqueClasses = isCreatedByUser
  //   ? 'bg-white dark:bg-gray-800 dark:text-gray-20'
  //   : 'bg-white dark:bg-gray-800 dark:text-gray-70';

  // const messageProps = {
  //   className: cn(commonClasses, uniqueClasses),
  //   titleclass: '',
  // };

  const icon = Icon({
    ...conversation,
    ...message,
    model: message?.model ?? conversation?.model,
    size: 28.8,
  });

  const regenerateMessage = () => {
    if (isSubmitting && isCreatedByUser) {
      return;
    }

    regenerate(message);
  };

  const copyToClipboard = (setIsCopied: React.Dispatch<React.SetStateAction<boolean>>) => {
    setIsCopied(true);
    copy(text ?? '');

    setTimeout(() => {
      setIsCopied(false);
    }, 3000);
  };

  const speak = (msg, updateHoverButtons) => {
    const cb = Symbol('stopCallback');
    const u = new SpeechSynthesisUtterance();
    u.lang = 'zh-CN';
    u.text = msg;
    u[cb] = updateHoverButtons;
    // console.log(msg);
    u.onend = (event) => {
      // console.log('Finshed speaking')
      event.utterance[cb]({ isStopped: true, isPaused: false });
    };
    synth.speak(u);
  };

  const pause = () => {
    synth.pause();
  };

  const resume = () => {
    synth.resume();
  };

  const stop = () => {
    synth.cancel();
  };

  const playbackMessage = (status, setStatus) => {
    let { isStopped, isPaused } = status;
    if (isStopped && !isPaused) {
      // console.log('(1) status ==> stopped: ' + isStopped + '->false, paused: ' + isPaused + ', text: ' + text)
      isStopped = false;
      stop();
      if (text) {
        setStatus({ isStopped, isPaused });
        if (error) {
          const errMsg = Error({ text });
          speak(errMsg, setStatus);
        } else {
          speak(text, setStatus);
        }
      }
    } else if (!isStopped && !isPaused) {
      // console.log('(2) status ==> stopped: ' + isStopped + ', paused: ' + isPaused + '->true, text: ' + text)
      isPaused = true;
      setStatus({ isStopped, isPaused });
      pause();
    } else if (!isStopped && isPaused) {
      // console.log('(3) status ==> stopped: ' + isStopped + ', paused: ' + isPaused + '->false, text: ' + text)
      isPaused = false;
      setStatus({ isStopped, isPaused });
      resume();
    } else {
      console.log('paly back status: ' + isStopped + ' ' + isPaused);
    }
  };

  const stopPlaybackMessage = (status, setStatus) => {
    let { isStopped, isPaused } = status;
    if (isStopped) {
      // console.log('(1) stop ==> ' + isStopped + ' ' + isPaused)
      // pass
    } else {
      // console.log('(2) stop ==> ' + isStopped + ' ' + isPaused)
      isStopped = true;
      isPaused = false;
      setStatus({ isStopped, isPaused });
      stop();
    }
  };

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
              <div className="select-none font-semibold">
                {isCreatedByUser ? 'You' : message.sender}
              </div>
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
              {isLast && isSubmitting ? null : (
                <SubRow classes="text-xs">
                  <SiblingSwitch
                    siblingIdx={siblingIdx}
                    siblingCount={siblingCount}
                    setSiblingIdx={setSiblingIdx}
                  />
                  <HoverButtons
                    showStopButton={false}
                    isEditing={edit}
                    message={message}
                    enterEdit={enterEdit}
                    isSubmitting={isSubmitting}
                    conversation={conversation ?? null}
                    regenerate={() => regenerateMessage()}
                    copyToClipboard={copyToClipboard}
                    handleContinue={handleContinue}
                    latestMessage={latestMessage}
                    stopPlaybackMessage={stopPlaybackMessage}
                    playbackMessage={playbackMessage}
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
        scrollToBottom={scrollToBottom}
        currentEditId={currentEditId}
        setCurrentEditId={setCurrentEditId}
      />
    </>
  );
}
