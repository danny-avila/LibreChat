import { memo, useRef, useMemo, useEffect, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import {
  supportsFiles,
  mergeFileConfig,
  isAssistantsEndpoint,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import {
  useChatContext,
  useChatFormContext,
  useAddedChatContext,
  useAssistantsMapContext,
} from '~/Providers';
import {
  useTextarea,
  useAutoSave,
  useRequiresKey,
  useHandleKeyUp,
  useQueryParams,
  useSubmitMessage,
} from '~/hooks';
import { cn, removeFocusRings, checkIfScrollable } from '~/utils';
import FileFormWrapper from './Files/FileFormWrapper';
import { TextareaAutosize } from '~/components/ui';
import { useGetFileConfig } from '~/data-provider';
import { TemporaryChat } from './TemporaryChat';
import TextareaHeader from './TextareaHeader';
import PromptsCommand from './PromptsCommand';
import AudioRecorder from './AudioRecorder';
import { mainTextareaId } from '~/common';
import CollapseChat from './CollapseChat';
import StreamAudio from './StreamAudio';
import StopButton from './StopButton';
import SendButton from './SendButton';
import Mention from './Mention';
import store from '~/store';

const ChatForm = ({ index = 0 }) => {
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  useQueryParams({ textAreaRef });

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isScrollable, setIsScrollable] = useState(false);

  const SpeechToText = useRecoilValue(store.speechToText);
  const TextToSpeech = useRecoilValue(store.textToSpeech);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
  const [isTemporaryChat, setIsTemporaryChat] = useRecoilState<boolean>(store.isTemporary);

  const isSearching = useRecoilValue(store.isSearching);
  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
  const [showPlusPopover, setShowPlusPopover] = useRecoilState(store.showPlusPopoverFamily(index));
  const [showMentionPopover, setShowMentionPopover] = useRecoilState(
    store.showMentionPopoverFamily(index),
  );

  const chatDirection = useRecoilValue(store.chatDirection).toLowerCase();
  const isRTL = chatDirection === 'rtl';

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
    setIsScrollable,
    disabled: !!(requiresKey ?? false),
  });

  const {
    files,
    setFiles,
    conversation,
    isSubmitting,
    filesLoading,
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

  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: null };
  const endpoint = endpointType ?? _endpoint;

  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const endpointFileConfig = fileConfig.endpoints[endpoint ?? ''];
  const invalidAssistant = useMemo(
    () =>
      isAssistantsEndpoint(conversation?.endpoint) &&
      (!(conversation?.assistant_id ?? '') ||
        !assistantMap?.[conversation?.endpoint ?? ''][conversation?.assistant_id ?? '']),
    [conversation?.assistant_id, conversation?.endpoint, assistantMap],
  );
  const disableInputs = useMemo(
    () => !!((requiresKey ?? false) || invalidAssistant),
    [requiresKey, invalidAssistant],
  );

  const { ref, ...registerProps } = methods.register('text', {
    required: true,
    onChange: (e) => {
      methods.setValue('text', e.target.value, { shouldValidate: true });
    },
  });

  useEffect(() => {
    if (!isSearching && textAreaRef.current && !disableInputs) {
      textAreaRef.current.focus();
    }
  }, [isSearching, disableInputs]);

  useEffect(() => {
    if (textAreaRef.current) {
      checkIfScrollable(textAreaRef.current);
    }
  }, []);

  const endpointSupportsFiles: boolean = supportsFiles[endpointType ?? endpoint ?? ''] ?? false;
  const isUploadDisabled: boolean = endpointFileConfig?.disabled ?? false;

  const baseClasses = cn(
    'md:py-3.5 m-0 w-full resize-none py-[13px] bg-surface-tertiary placeholder-black/50 dark:placeholder-white/50 [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]',
    isCollapsed ? 'max-h-[52px]' : 'max-h-[65vh] md:max-h-[75vh]',
  );

  const uploadActive = endpointSupportsFiles && !isUploadDisabled;
  const speechClass = isRTL
    ? `pr-${uploadActive ? '12' : '4'} pl-12`
    : `pl-${uploadActive ? '12' : '4'} pr-12`;

  return (
    <form
      onSubmit={methods.handleSubmit((data) => submitMessage(data))}
      className={cn(
        'mx-auto flex flex-row gap-3 pl-2 transition-all duration-200 last:mb-2',
        maximizeChatSpace ? 'w-full max-w-full' : 'md:max-w-2xl xl:max-w-3xl',
      )}
    >
      <div className="relative flex h-full flex-1 items-stretch md:flex-col">
        <div className="flex w-full items-center">
          {showPlusPopover && !isAssistantsEndpoint(endpoint) && (
            <Mention
              setShowMentionPopover={setShowPlusPopover}
              newConversation={generateConversation}
              textAreaRef={textAreaRef}
              commandChar="+"
              placeholder="com_ui_add_model_preset"
              includeAssistants={false}
            />
          )}
          {showMentionPopover && (
            <Mention
              setShowMentionPopover={setShowMentionPopover}
              newConversation={newConversation}
              textAreaRef={textAreaRef}
            />
          )}
          <PromptsCommand index={index} textAreaRef={textAreaRef} submitPrompt={submitPrompt} />
          <div className="transitional-all relative flex w-full grow flex-col overflow-hidden rounded-3xl bg-surface-tertiary text-text-primary duration-200">
            <TemporaryChat
              isTemporaryChat={isTemporaryChat}
              setIsTemporaryChat={setIsTemporaryChat}
            />
            <TextareaHeader addedConvo={addedConvo} setAddedConvo={setAddedConvo} />
            <FileFormWrapper disableInputs={disableInputs}>
              {endpoint && (
                <>
                  <CollapseChat
                    isCollapsed={isCollapsed}
                    isScrollable={isScrollable}
                    setIsCollapsed={setIsCollapsed}
                  />
                  <TextareaAutosize
                    {...registerProps}
                    ref={(e) => {
                      ref(e);
                      textAreaRef.current = e;
                    }}
                    disabled={disableInputs}
                    onPaste={handlePaste}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    onHeightChange={() => {
                      if (textAreaRef.current) {
                        const scrollable = checkIfScrollable(textAreaRef.current);
                        setIsScrollable(scrollable);
                      }
                    }}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    id={mainTextareaId}
                    tabIndex={0}
                    data-testid="text-input"
                    rows={1}
                    onFocus={() => isCollapsed && setIsCollapsed(false)}
                    onClick={() => isCollapsed && setIsCollapsed(false)}
                    style={{ height: 44, overflowY: 'auto' }}
                    className={cn(
                      baseClasses,
                      speechClass,
                      removeFocusRings,
                      'transition-[max-height] duration-200',
                    )}
                  />
                </>
              )}
            </FileFormWrapper>
            {SpeechToText && (
              <AudioRecorder
                isRTL={isRTL}
                methods={methods}
                ask={submitMessage}
                textAreaRef={textAreaRef}
                disabled={!!disableInputs}
                isSubmitting={isSubmitting}
              />
            )}
            {TextToSpeech && automaticPlayback && <StreamAudio index={index} />}
          </div>
          <div
            className={cn(
              'mb-[5px] ml-[8px] flex flex-col items-end justify-end',
              isRTL && 'order-first mr-[8px]',
            )}
            style={{ alignSelf: 'flex-end' }}
          >
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
          </div>
        </div>
      </div>
    </form>
  );
};

export default memo(ChatForm);
