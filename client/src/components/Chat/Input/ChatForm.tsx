import React, { memo, useRef, useEffect, useState, useMemo } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import {
  supportsFiles,
  mergeFileConfig,
  isAssistantsEndpoint,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import {
  useChatContext,
  useAddedChatContext,
  useAssistantsMapContext,
  useChatFormContext,
} from '~/Providers';
import {
  useTextarea,
  useAutoSave,
  useRequiresKey,
  useHandleKeyUp,
  useSubmitMessage,
} from '~/hooks';
import { TextareaAutosize } from '~/components/ui';
import { useGetFileConfig } from '~/data-provider';
import { cn, removeFocusRings } from '~/utils';
import TextareaHeader from './TextareaHeader';
import AttachFile from './Files/AttachFile';
import AudioRecorder from './AudioRecorder';
import { mainTextareaId } from '~/common';
import StreamAudio from './StreamAudio';
import StopButton from './StopButton';
import SendButton from './SendButton';
import FileRow from './Files/FileRow';
import Mention from './Mention';
import store from '~/store';
import promptTextState from '~/store';
import PromptsCommand from './PromptsCommand';

import CallOverlay from './CallOverlay';

const ChatForm = ({ index = 0 }) => {
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const SpeechToText = useRecoilValue(store.speechToText);
  const TextToSpeech = useRecoilValue(store.textToSpeech);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);

  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
  const [showPlusPopover, setShowPlusPopover] = useRecoilState(store.showPlusPopoverFamily(index));
  const [showMentionPopover, setShowMentionPopover] = useRecoilState(
    store.showMentionPopoverFamily(index),
  );

  const [showCallOverlay, setShowCallOverlay] = useRecoilState(store.showCallOverlay);
  const eventTarget = useMemo(() => new EventTarget(), []); // Use useMemo to create the EventTarget once

  const { requiresKey } = useRequiresKey();
  const handleKeyUp = useHandleKeyUp({
    index,
    textAreaRef,
    setShowPlusPopover,
    setShowMentionPopover,
  });
  const { handlePaste, handleKeyDown, handleCompositionStart, handleCompositionEnd } = useTextarea({
    textAreaRef,
    submitButtonRef,
    disabled: !!requiresKey,
  });

  const {
    files,
    setFiles,
    conversation,
    isSubmitting,
    filesLoading,
    setFilesLoading,
    newConversation,
    handleStopGenerating,
  } = useChatContext();
  const methods = useChatFormContext();
  const {
    addedIndex,
    generateConversation,
    conversation: addedConvo,
    setConversation: setAddedConvo,
    isSubmitting: isSubmittingAdded,
  } = useAddedChatContext();
  const showStopAdded = useRecoilValue(store.showStopButtonByIndex(addedIndex));

  const { clearDraft } = useAutoSave({
    conversationId: useMemo(() => conversation?.conversationId, [conversation]),
    textAreaRef,
    files,
    setFiles,
  });

  const assistantMap = useAssistantsMapContext();
  const { submitMessage, submitPrompt } = useSubmitMessage({ clearDraft });
  const promptText = useRecoilValue(promptTextState.text);

  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: null };
  const endpoint = endpointType ?? _endpoint;

  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const endpointFileConfig = fileConfig.endpoints[endpoint ?? ''];
  const invalidAssistant = useMemo(
    () =>
      isAssistantsEndpoint(conversation?.endpoint) &&
      (!conversation?.assistant_id ||
        !assistantMap?.[conversation?.endpoint ?? '']?.[conversation?.assistant_id ?? '']),
    [conversation?.assistant_id, conversation?.endpoint, assistantMap],
  );
  const disableInputs = useMemo(
    () => !!(requiresKey || invalidAssistant),
    [requiresKey, invalidAssistant],
  );
  useEffect(() => {
    if (promptText) {
      methods.setValue('text', promptText);
    }
  }, [methods, textAreaRef, promptText]);
  const { ref, ...registerProps } = methods.register('text', {
    required: true,
    onChange: (e) => {
      methods.setValue('text', e.target.value, { shouldValidate: true });
    },
  });

  const openCallOverlay = () => {
    setShowCallOverlay(true);
  };

  return (
    <>
      <form
        onSubmit={methods.handleSubmit((data) => submitMessage(data))}
        className="stretch mx-2 flex flex-row gap-3 last:mb-2 md:mx-4 md:last:mb-6 lg:mx-auto lg:max-w-2xl xl:max-w-3xl"
      >
        <div className="relative flex h-full max-w-full flex-1 flex-col">
          <div className="flex w-full items-center">
            {/* Outros componentes acima, como Mention e PromptsCommand */}
            <div className="bg-token-main-surface-primary relative flex w-full flex-grow flex-col overflow-hidden rounded-3xl bg-[#f4f4f4] dark:bg-gray-700 dark:text-white [&:has(textarea:focus)]:border-gray-300 [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)] dark:[&:has(textarea:focus)]:border-gray-500">
              <TextareaHeader addedConvo={addedConvo} setAddedConvo={setAddedConvo} />

              <FileRow
                files={files}
                setFiles={setFiles}
                setFilesLoading={setFilesLoading}
                Wrapper={({ children }) => (
                  <div className="mx-2 mt-2 flex flex-wrap gap-2 px-2.5 md:pl-0 md:pr-4">
                    {children}
                  </div>
                )}
              />

              {/* Contêiner para TextArea */}
              <div className="relative flex w-full">
                <TextareaAutosize
                  {...registerProps}
                  autoFocus
                  ref={(e) => {
                    ref(e);
                    textAreaRef.current = e;
                  }}
                  disabled={disableInputs}
                  onPaste={handlePaste}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  id={mainTextareaId}
                  tabIndex={0}
                  data-testid="text-input"
                  style={{ height: 44, overflowY: 'auto' }}
                  rows={1}
                  className={cn(
                    supportsFiles[endpointType ?? endpoint ?? ''] && !endpointFileConfig?.disabled
                      ? ' pl-10 md:pl-[55px]'
                      : 'pl-3 md:pl-4',
                    'm-0 w-full resize-none border-0 bg-transparent py-[10px] placeholder-black/50 focus:ring-0 focus-visible:ring-0 dark:bg-transparent dark:placeholder-white/50 md:py-3.5  ',
                    SpeechToText ? 'pr-20 md:pr-[85px]' : 'pr-10 md:pr-12',
                    'max-h-[65vh] md:max-h-[75vh]',
                    removeFocusRings,
                  )}
                />
              </div>

              <CallOverlay
                eventTarget={eventTarget}
                showCallOverlay={showCallOverlay}
                disableInputs={disableInputs}
                textAreaRef={textAreaRef}
                methods={methods}
                index={index}
                TextToSpeech={TextToSpeech}
                automaticPlayback={automaticPlayback}
                ask={submitMessage}
              />

              <button
                onClick={openCallOverlay}
                className="absolute bottom-1.5 right-20 flex h-[30px] w-[30px] items-center justify-center rounded-lg p-0.5 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 md:bottom-3 md:right-20"
                type="button"
              >
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="0"
                  stroke="currentColor"
                  className="size-10"
                >
                  <path
                    fillRule="evenodd"
                    d="M12 5a7 7 0 0 0-7 7v1.17c.313-.11.65-.17 1-.17h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6a3 3 0 0 1-3-3v-6a9 9 0 0 1 18 0v6a3 3 0 0 1-3 3h-2a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h2c.35 0 .687.06 1 .17V12a7 7 0 0 0-7-7Z"
                    clipRule="evenodd"
                  ></path>
                </svg>
              </button>

              <AttachFile
                endpoint={_endpoint ?? ''}
                endpointType={endpointType}
                disabled={disableInputs}
              />
              {(isSubmitting || isSubmittingAdded) && (showStopButton || showStopAdded) ? (
                <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
              ) : (
                endpoint && (
                  <SendButton
                    ref={submitButtonRef}
                    control={methods.control}
                    disabled={!!(filesLoading || isSubmitting || disableInputs)}
                  />
                )
              )}
              {SpeechToText && (
                <AudioRecorder
                  disabled={!!disableInputs}
                  textAreaRef={textAreaRef}
                  ask={submitMessage}
                  methods={methods}
                />
              )}
              {TextToSpeech && automaticPlayback && <StreamAudio index={index} />}
            </div>
          </div>
        </div>
      </form>

      {/* CallOverlay fora do form */}
    </>
  );
};

export default memo(ChatForm);
