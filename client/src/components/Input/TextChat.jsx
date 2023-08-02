import React, { useEffect, useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useRecoilValue, useRecoilState, useSetRecoilState } from 'recoil';
import SubmitButton from './SubmitButton';
import OptionsBar from './OptionsBar';
import { EndpointMenu } from './EndpointMenu';
import Footer from './Footer';
import { useMessageHandler } from '~/utils/handleSubmit';
import { cn } from '~/utils';
import store from '~/store';

export default function TextChat({ isSearchView = false }) {
  const inputRef = useRef(null);
  const isComposing = useRef(false);

  const [text, setText] = useRecoilState(store.text);
  const conversation = useRecoilValue(store.conversation);
  const latestMessage = useRecoilValue(store.latestMessage);

  const endpointsConfig = useRecoilValue(store.endpointsConfig);
  const isSubmitting = useRecoilValue(store.isSubmitting);
  const setShowBingToneSetting = useSetRecoilState(store.showBingToneSetting);

  // TODO: do we need this?
  const disabled = false;

  const { ask, stopGenerating } = useMessageHandler();
  const isNotAppendable = latestMessage?.unfinished & !isSubmitting || latestMessage?.error;
  const { conversationId, jailbreak } = conversation || {};

  // auto focus to input, when enter a conversation.
  useEffect(() => {
    if (!conversationId) {
      return;
    }

    // Prevents Settings from not showing on new conversation, also prevents showing toneStyle change without jailbreak
    if (conversationId === 'new' || !jailbreak) {
      setShowBingToneSetting(false);
    }

    if (conversationId !== 'search') {
      inputRef.current?.focus();
    }
    // setShowBingToneSetting is a recoil setter, so it doesn't need to be in the dependency array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, jailbreak]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [isSubmitting]);

  const submitMessage = () => {
    ask({ text });
    setText('');
  };

  const handleStopGenerating = (e) => {
    e.preventDefault();
    stopGenerating();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isSubmitting) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
    }

    if (e.key === 'Enter' && !e.shiftKey && !isComposing?.current) {
      submitMessage();
    }
  };

  const handleKeyUp = (e) => {
    if (e.keyCode === 8 && e.target.value.trim() === '') {
      setText(e.target.value);
    }

    if (e.key === 'Enter' && e.shiftKey) {
      return console.log('Enter + Shift');
    }

    if (isSubmitting) {
      return;
    }
  };

  const handleCompositionStart = () => {
    isComposing.current = true;
  };

  const handleCompositionEnd = () => {
    isComposing.current = false;
  };

  const changeHandler = (e) => {
    const { value } = e.target;

    setText(value);
  };

  const getPlaceholderText = () => {
    if (isSearchView) {
      return 'Click a message title to open its conversation.';
    }

    if (disabled) {
      return 'Choose another model or customize GPT again';
    }

    if (isNotAppendable) {
      return 'Edit your message or Regenerate.';
    }

    return '';
  };

  if (isSearchView) {
    return <></>;
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 w-full border-transparent bg-gradient-to-b from-transparent via-white to-white pt-6 dark:border-white/20 dark:via-gray-800 dark:to-gray-800 md:absolute">
        <OptionsBar />
        <div className="input-panel md:bg-vert-light-gradient dark:md:bg-vert-dark-gradient relative w-full border-t bg-white py-2 dark:border-white/20 dark:bg-gray-800 md:border-t-0 md:border-transparent md:bg-transparent md:dark:border-transparent md:dark:bg-transparent">
          {/* <form className="stretch z-[60] mx-2 flex flex-row gap-3 last:mb-2 md:pt-2 md:last:mb-6 lg:mx-auto lg:max-w-3xl lg:pt-6"> */}
          <form className="stretch z-[60] mx-2 flex flex-row gap-3 last:mb-2 md:mx-4 md:pt-2 md:last:mb-6 lg:mx-auto lg:max-w-2xl lg:pt-6 xl:max-w-3xl">
            <div className="relative flex h-full flex-1 md:flex-col">
              <div
                className={cn(
                  'relative flex flex-grow flex-row rounded-xl border border-black/10 py-[10px] md:py-4 md:pl-4',
                  'shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:shadow-[0_0_15px_rgba(0,0,0,0.10)]',
                  'dark:border-gray-900/50 dark:text-white',
                  disabled ? 'bg-gray-100 dark:bg-gray-900' : 'bg-white dark:bg-gray-700',
                )}
              >
                {/* <div
                className={`relative flex flex-grow flex-row rounded-md border border-black/10 ${
                  disabled ? 'bg-gray-100' : 'bg-white'
                } py-2 shadow-[0_0_10px_rgba(0,0,0,0.10)] dark:border-gray-900/50 ${
                  disabled ? 'dark:bg-gray-900' : 'dark:bg-gray-700'
                } dark:text-white dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] md:py-3 md:pl-4`}
              >
                */}
                {/* <div className="flex flex-col w-full py-[10px] flex-grow md:py-4 md:pl-4
              relative border border-black/10 bg-white dark:border-gray-900/50 dark:text-white
              dark:bg-gray-700 rounded-xl shadow-xs dark:shadow-xs"> */}
                <EndpointMenu />
                <TextareaAutosize
                  // set test id for e2e testing
                  data-testid="text-input"
                  tabIndex="0"
                  autoFocus
                  ref={inputRef}
                  // style={{maxHeight: '200px', height: '24px', overflowY: 'hidden'}}
                  rows="1"
                  value={disabled || isNotAppendable ? '' : text}
                  onKeyUp={handleKeyUp}
                  onKeyDown={handleKeyDown}
                  onChange={changeHandler}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  placeholder={getPlaceholderText()}
                  disabled={disabled || isNotAppendable}
                  className="m-0 flex h-auto max-h-52 flex-1 resize-none overflow-auto border-0 bg-transparent p-0 pl-2 pr-12 leading-6 placeholder:text-sm placeholder:text-gray-600 focus:outline-none focus:ring-0 focus-visible:ring-0 dark:bg-transparent dark:placeholder:text-gray-500 md:pl-2"
                />
                <SubmitButton
                  submitMessage={submitMessage}
                  handleStopGenerating={handleStopGenerating}
                  disabled={disabled || isNotAppendable}
                  isSubmitting={isSubmitting}
                  endpointsConfig={endpointsConfig}
                  endpoint={conversation?.endpoint}
                />
              </div>
            </div>
          </form>
          <Footer />
        </div>
      </div>
    </>
  );
}
