import { memo, useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useWatch } from 'react-hook-form';
import { useRecoilState, useRecoilValue } from 'recoil';
import { isAssistantsEndpoint } from 'librechat-data-provider';
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
import { mainTextareaId, BadgeItem } from '~/common';
import AttachFileChat from './Files/AttachFileChat';
import FileFormChat from './Files/FileFormChat';
import { TextareaAutosize } from '~/components';
import { cn, removeFocusRings } from '~/utils';
import TextareaHeader from './TextareaHeader';
import PromptsCommand from './PromptsCommand';
import AudioRecorder from './AudioRecorder';
import CollapseChat from './CollapseChat';
import StreamAudio from './StreamAudio';
import StopButton from './StopButton';
import SendButton from './SendButton';
import { BadgeRow } from './BadgeRow';
import EditBadges from './EditBadges';
import Mention from './Mention';
import store from '~/store';

const ChatForm = memo(({ index = 0 }: { index?: number }) => {
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const [isCollapsed, setIsCollapsed] = useState(false);
  // TODO: Remove setIsScrollable
  const [, setIsScrollable] = useState(false);
  const [visualRowCount, setVisualRowCount] = useState(1);
  const [isTextAreaFocused, setIsTextAreaFocused] = useState(false);
  const [backupBadges, setBackupBadges] = useState<Pick<BadgeItem, 'id'>[]>([]);

  const SpeechToText = useRecoilValue(store.speechToText);
  const TextToSpeech = useRecoilValue(store.textToSpeech);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
  const chatDirection = useRecoilValue(store.chatDirection);
  const isSearching = useRecoilValue(store.isSearching);

  const [badges, setBadges] = useRecoilState(store.chatBadges);
  const [isEditingBadges, setIsEditingBadges] = useRecoilState(store.isEditingBadges);
  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
  const [showPlusPopover, setShowPlusPopover] = useRecoilState(store.showPlusPopoverFamily(index));
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
    [conversation?.endpointType, conversation?.endpoint],
  );

  const isRTL = useMemo(() => chatDirection === 'rtl', [chatDirection.toLowerCase()]);
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
    conversationId: conversation?.conversationId,
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
      (e: React.ChangeEvent<HTMLTextAreaElement>) =>
        methods.setValue('text', e.target.value, { shouldValidate: true }),
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
    if (textAreaRef.current) {
      const style = window.getComputedStyle(textAreaRef.current);
      const lineHeight = parseFloat(style.lineHeight);
      setVisualRowCount(Math.floor(textAreaRef.current.scrollHeight / lineHeight));
    }
  }, [textValue]);

  useEffect(() => {
    if (isEditingBadges && backupBadges.length === 0) {
      setBackupBadges([...badges]);
    }
  }, [isEditingBadges, badges, backupBadges.length]);

  const handleSaveBadges = useCallback(() => {
    setIsEditingBadges(false);
    setBackupBadges([]);
  }, []);

  const handleCancelBadges = useCallback(() => {
    if (backupBadges.length > 0) {
      setBadges([...backupBadges]);
    }
    setIsEditingBadges(false);
    setBackupBadges([]);
  }, [backupBadges, setBadges]);

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
        'mx-auto flex flex-row gap-3 transition-all duration-200 sm:mb-2 sm:px-2',
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
            <TextareaHeader addedConvo={addedConvo} setAddedConvo={setAddedConvo} />
            <EditBadges
              isEditingChatBadges={isEditingBadges}
              handleCancelBadges={handleCancelBadges}
              handleSaveBadges={handleSaveBadges}
              setBadges={setBadges}
            />
            <FileFormChat disableInputs={disableInputs} />
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
                  onFocus={() => {
                    handleFocusOrClick();
                    setIsTextAreaFocused(true);
                  }}
                  onBlur={setIsTextAreaFocused.bind(null, false)}
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
            <div
              className={cn(
                'items-between flex gap-2 pb-2',
                isRTL ? 'flex-row-reverse' : 'flex-row',
              )}
            >
              <div className={`${isRTL ? 'mr-2' : 'ml-2'}`}>
                <AttachFileChat disableInputs={disableInputs} />
              </div>
              <BadgeRow onChange={(newBadges) => setBadges(newBadges)} />
              <div className="mx-auto flex" />
              {SpeechToText && (
                <AudioRecorder
                  methods={methods}
                  ask={submitMessage}
                  textAreaRef={textAreaRef}
                  disabled={disableInputs}
                  isSubmitting={isSubmitting}
                />
              )}
              <div className={`${isRTL ? 'ml-2' : 'mr-2'}`}>
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
