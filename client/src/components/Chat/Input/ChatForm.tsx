import { memo, useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useWatch } from 'react-hook-form';
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
import { mainTextareaId, BadgeItem } from '~/common';
import { TextareaAutosize } from '~/components/ui';
import { useGetFileConfig } from '~/data-provider';
import { TemporaryChat } from './TemporaryChat';
import TextareaHeader from './TextareaHeader';
import PromptsCommand from './PromptsCommand';
import AudioRecorder from './AudioRecorder';
import CollapseChat from './CollapseChat';
import StreamAudio from './StreamAudio';
import StopButton from './StopButton';
import SendButton from './SendButton';
import EditBadges from './EditBadges';
import { BadgeRow } from './BadgeRow';
import Mention from './Mention';
import store from '~/store';

const ChatForm = memo(({ index = 0 }) => {
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const [isCollapsed, setIsCollapsed] = useState(false);
  // TODO: Remove setIsScrollable
  const [, setIsScrollable] = useState(false);
  const [visualRowCount, setVisualRowCount] = useState(1);
  const [isTextAreaFocused, setIsTextAreaFocused] = useState(false);
  const [editingBadges, setEditingBadges] = useState<BadgeItem[] | null>(null);

  const SpeechToText = useRecoilValue(store.speechToText);
  const TextToSpeech = useRecoilValue(store.textToSpeech);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
  const chatDirection = useRecoilValue(store.chatDirection);
  const isSearching = useRecoilValue(store.isSearching);
  const [badges, setBadges] = useRecoilState(store.chatBadges);
  const [isTemporaryChat, setIsTemporaryChat] = useRecoilState(store.isTemporary);
  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
  const [showPlusPopover, setShowPlusPopover] = useRecoilState(store.showPlusPopoverFamily(index));
  const [isEditingChatBadges, setIsEditingChatBadges] = useRecoilState(store.isEditingBadges);
  const [showMentionPopover, setShowMentionPopover] = useRecoilState(
    store.showMentionPopoverFamily(index),
  );

  const { requiresKey } = useRequiresKey();
  const methods = useChatFormContext();
  const {
    files,
    setFiles,
    conversation,
    isSubmitting,
    filesLoading,
    newConversation,
    handleStopGenerating,
  } = useChatContext();
  const {
    addedIndex,
    generateConversation,
    conversation: addedConvo,
    setConversation: setAddedConvo,
    isSubmitting: isSubmittingAdded,
  } = useAddedChatContext();
  const assistantMap = useAssistantsMapContext();
  const showStopAdded = useRecoilValue(store.showStopButtonByIndex(addedIndex));

  const endpoint = useMemo(
    () => conversation?.endpointType ?? conversation?.endpoint,
    [conversation],
  );
  const isRTL = useMemo(() => chatDirection.toLowerCase() === 'rtl', [chatDirection]);
  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({ select: mergeFileConfig });
  const invalidAssistant = useMemo(
    () =>
      isAssistantsEndpoint(endpoint) &&
      (!(conversation?.assistant_id ?? '') ||
        !assistantMap?.[endpoint ?? '']?.[conversation?.assistant_id ?? '']),
    [conversation?.assistant_id, endpoint, assistantMap],
  );
  const disableInputs = useMemo(
    () => requiresKey || invalidAssistant,
    [requiresKey, invalidAssistant],
  );

  const handleContainerClick = useCallback(() => {
    textAreaRef.current?.focus();
  }, []);

  const handleFocusOrClick = useCallback(() => {
    if (isCollapsed) {
      setIsCollapsed(false);
    }
  }, [isCollapsed]);

  const { clearDraft } = useAutoSave({
    conversationId: useMemo(() => conversation?.conversationId, [conversation]),
    textAreaRef,
    files,
    setFiles,
  });

  const { submitMessage, submitPrompt } = useSubmitMessage({ clearDraft });
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
    disabled: disableInputs,
  });

  useQueryParams({ textAreaRef });

  const { ref, ...registerProps } = methods.register('text', {
    required: true,
    onChange: useCallback(
      (e) => methods.setValue('text', e.target.value, { shouldValidate: true }),
      [methods],
    ),
  });

  const textValue = useWatch({ control: methods.control, name: 'text' });

  useEffect(() => {
    if (!isSearching && textAreaRef.current && !disableInputs) {
      textAreaRef.current.focus();
    }
  }, [isSearching, disableInputs]);

  useEffect(() => {
    if (isEditingChatBadges) {
      setEditingBadges([...badges]);
    }
  }, [isEditingChatBadges]);

  const handleSaveBadges = () => {
    setIsEditingChatBadges(false);
    setEditingBadges(null);
  };

  const handleCancelBadges = () => {
    if (editingBadges) {
      setBadges(editingBadges);
    }
    setIsEditingChatBadges(false);
    setEditingBadges(null);
  };

  useEffect(() => {
    if (textAreaRef.current) {
      const style = window.getComputedStyle(textAreaRef.current);
      const lineHeight = parseFloat(style.lineHeight);
      setVisualRowCount(Math.floor(textAreaRef.current.scrollHeight / lineHeight));
    }
  }, [textValue]);

  const isMoreThanThreeRows = visualRowCount > 3;

  const baseClasses = useMemo(
    () =>
      cn(
        'md:py-3.5 m-0 w-full resize-none py-[13px] bg-surface-chat placeholder-black/50 dark:placeholder-white/50 [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]',
        isCollapsed ? 'max-h-[52px]' : 'max-h-[45vh] md:max-h-[55vh]',
        isMoreThanThreeRows ? 'pl-5' : 'px-5',
      ),
    [isCollapsed, isMoreThanThreeRows],
  );

  return (
    <form
      onSubmit={methods.handleSubmit(submitMessage)}
      className={cn(
        'mx-auto flex flex-row gap-3 transition-all duration-200 last:mb-2 sm:px-2',
        maximizeChatSpace ? 'w-full max-w-full' : 'md:max-w-3xl xl:max-w-4xl',
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
          <div
            onClick={handleContainerClick}
            className={cn(
              'relative flex w-full flex-grow flex-col overflow-hidden rounded-t-3xl border border-border-light bg-surface-chat text-text-primary transition-all duration-200 sm:rounded-3xl',
              isTextAreaFocused ? 'shadow-lg' : 'shadow-md',
            )}
          >
            <TemporaryChat
              isTemporaryChat={isTemporaryChat}
              setIsTemporaryChat={setIsTemporaryChat}
            />
            <TextareaHeader addedConvo={addedConvo} setAddedConvo={setAddedConvo} />
            <EditBadges
              isEditingChatBadges={isEditingChatBadges}
              handleCancelBadges={handleCancelBadges}
              handleSaveBadges={handleSaveBadges}
            />
            {endpoint && (
              <div className="flex flex-row">
                <TextareaAutosize
                  {...registerProps}
                  ref={(e) => {
                    ref(e);
                    (textAreaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = e;
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
                  rows={1}
                  onFocus={(e) => {
                    handleFocusOrClick();
                    setIsTextAreaFocused(true);
                  }}
                  onBlur={(e) => setIsTextAreaFocused(false)}
                  onClick={handleFocusOrClick}
                  style={{ height: 44, overflowY: 'auto' }}
                  className={cn(
                    baseClasses,
                    removeFocusRings,
                    'transition-[max-height] duration-200',
                  )}
                />

                <div className="flex flex-col items-start justify-start pt-1.5">
                  <CollapseChat
                    isCollapsed={isCollapsed}
                    isScrollable={isMoreThanThreeRows}
                    setIsCollapsed={setIsCollapsed}
                  />
                </div>
              </div>
            )}
            <div className="items-between flex flex-row justify-end">
              <FileFormWrapper disableInputs={disableInputs} />
              <BadgeRow badges={badges} onChange={setBadges} />
              <div
                className={cn(
                  'mb-2 mr-2 flex flex-col items-end justify-end',
                  isRTL && 'order-first ml-2',
                )}
              >
                {SpeechToText && (
                  <AudioRecorder
                    isRTL={isRTL}
                    methods={methods}
                    ask={submitMessage}
                    textAreaRef={textAreaRef}
                    disabled={disableInputs}
                    isSubmitting={isSubmitting}
                  />
                )}
              </div>
              <div className="mb-2 mr-2">
                {(isSubmitting || isSubmittingAdded) && (showStopButton || showStopAdded) ? (
                  <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
                ) : (
                  endpoint && (
                    <SendButton
                      ref={submitButtonRef}
                      control={methods.control}
                      disabled={filesLoading || isSubmitting || disableInputs}
                    />
                  )
                )}
              </div>
            </div>
            {TextToSpeech && automaticPlayback && <StreamAudio index={index} />}
          </div>
        </div>
      </div>
    </form>
  );
});

export default ChatForm;
