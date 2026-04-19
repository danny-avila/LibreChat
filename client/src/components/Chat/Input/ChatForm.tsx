import { memo, useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useWatch } from 'react-hook-form';
import { TextareaAutosize } from '@librechat/client';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Constants, isAssistantsEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import type { ExtendedFile, FileSetter, ConvoGenerator } from '~/common';
import {
  useChatContext,
  useChatFormContext,
  useAddedChatContext,
  useAssistantsMapContext,
} from '~/Providers';
import {
  useTextarea,
  useAutoSave,
  useLocalize,
  useRequiresKey,
  useHandleKeyUp,
  useQueryParams,
  useSubmitMessage,
  useRequiresPermission,
  useFocusChatEffect,
} from '~/hooks';
import { mainTextareaId, BadgeItem } from '~/common';
import AttachFileChat from './Files/AttachFileChat';
import FileFormChat from './Files/FileFormChat';
import { cn, removeFocusRings } from '~/utils';
import TextareaHeader from './TextareaHeader';
import PromptsCommand from './PromptsCommand';
import AudioRecorder from './AudioRecorder';
import CollapseChat from './CollapseChat';
import StreamAudio from './StreamAudio';
import StopButton from './StopButton';
import SendButton from './SendButton';
import EditBadges from './EditBadges';
import BadgeRow from './BadgeRow';
import Mention from './Mention';
import store from '~/store';

interface ChatFormProps {
  index: number;
  /** From ChatContext — individual values so memo can compare them */
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  conversation: TConversation | null;
  isSubmitting: boolean;
  filesLoading: boolean;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  newConversation: ConvoGenerator;
  handleStopGenerating: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const ChatForm = memo(function ChatForm({
  index,
  files,
  setFiles,
  conversation,
  isSubmitting,
  filesLoading,
  setFilesLoading,
  newConversation,
  handleStopGenerating,
}: ChatFormProps) {
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  useFocusChatEffect(textAreaRef);
  const localize = useLocalize();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [, setIsScrollable] = useState(false);
  const [visualRowCount, setVisualRowCount] = useState(1);
  const [isTextAreaFocused, setIsTextAreaFocused] = useState(false);
  const [backupBadges, setBackupBadges] = useState<Pick<BadgeItem, 'id'>[]>([]);

  const SpeechToText = useRecoilValue(store.speechToText);
  const TextToSpeech = useRecoilValue(store.textToSpeech);
  const chatDirection = useRecoilValue(store.chatDirection);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);
  const isTemporary = useRecoilValue(store.isTemporary);

  const [badges, setBadges] = useRecoilState(store.chatBadges);
  const [isEditingBadges, setIsEditingBadges] = useRecoilState(store.isEditingBadges);
  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
  const plusPopoverAtom = useMemo(() => store.showPlusPopoverFamily(index), [index]);
  const mentionPopoverAtom = useMemo(() => store.showMentionPopoverFamily(index), [index]);

  const { requiresKey } = useRequiresKey();
  const methods = useChatFormContext();
  const { requiresPermission } = useRequiresPermission();
  const {
    generateConversation,
    conversation: addedConvo,
    setConversation: setAddedConvo,
  } = useAddedChatContext();
  const assistantMap = useAssistantsMapContext();

  const endpoint = useMemo(
    () => conversation?.endpointType ?? conversation?.endpoint,
    [conversation?.endpointType, conversation?.endpoint],
  );
  const conversationId = useMemo(
    () => conversation?.conversationId ?? Constants.NEW_CONVO,
    [conversation?.conversationId],
  );

  const isRTL = useMemo(
    () => (chatDirection != null ? chatDirection?.toLowerCase() === 'rtl' : false),
    [chatDirection],
  );
  const invalidAssistant = useMemo(
    () =>
      isAssistantsEndpoint(endpoint) &&
      (!(conversation?.assistant_id ?? '') ||
        !assistantMap?.[endpoint ?? '']?.[conversation?.assistant_id ?? '']),
    [conversation?.assistant_id, endpoint, assistantMap],
  );
  const disableInputs = useMemo(
    () => requiresKey || invalidAssistant || requiresPermission,
    [requiresKey, invalidAssistant, requiresPermission],
  );

  const handleContainerClick = useCallback(() => {
    /** Check if the device is a touchscreen */
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      return;
    }
    textAreaRef.current?.focus();
  }, []);

  const handleFocusOrClick = useCallback(() => {
    if (isCollapsed) {
      setIsCollapsed(false);
    }
  }, [isCollapsed]);

  const handleTextareaFocus = useCallback(() => {
    handleFocusOrClick();
    setIsTextAreaFocused(true);
  }, [handleFocusOrClick]);

  const handleTextareaBlur = useCallback(() => {
    setIsTextAreaFocused(false);
  }, []);

  useAutoSave({
    files,
    setFiles,
    textAreaRef,
    conversationId,
    isSubmitting,
  });

  const { submitMessage, submitPrompt } = useSubmitMessage();

  const handleKeyUp = useHandleKeyUp({
    index,
    textAreaRef,
  });
  const {
    isNotAppendable,
    handlePaste,
    handleKeyDown,
    handleCompositionStart,
    handleCompositionEnd,
  } = useTextarea({
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
  }, [setIsEditingBadges, setBackupBadges]);

  const handleCancelBadges = useCallback(() => {
    if (backupBadges.length > 0) {
      setBadges([...backupBadges]);
    }
    setIsEditingBadges(false);
    setBackupBadges([]);
  }, [backupBadges, setBadges, setIsEditingBadges]);

  const isMoreThanThreeRows = visualRowCount > 3;

  const baseClasses = useMemo(
    () =>
      cn(
        'md:py-3.5 m-0 w-full resize-none py-[13px] placeholder-black/60 bg-transparent dark:placeholder-white/60 [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]',
        isCollapsed ? 'max-h-[52px]' : 'max-h-[45vh] md:max-h-[55vh]',
        isMoreThanThreeRows ? 'pl-5' : 'px-5',
      ),
    [isCollapsed, isMoreThanThreeRows],
  );

  return (
    <form
      onSubmit={methods.handleSubmit(submitMessage)}
      className={cn(
        'mx-auto flex w-full flex-row gap-3 transition-[max-width] duration-300 sm:px-2',
        maximizeChatSpace ? 'max-w-full' : 'md:max-w-3xl xl:max-w-4xl',
        centerFormOnLanding &&
          (conversationId == null || conversationId === Constants.NEW_CONVO) &&
          !isSubmitting &&
          conversation?.messages?.length === 0
          ? 'transition-all duration-200 sm:mb-28'
          : 'sm:mb-10',
      )}
    >
      <div className="relative flex h-full flex-1 items-stretch md:flex-col">
        <div className={cn('flex w-full items-center', isRTL && 'flex-row-reverse')}>
          <Mention
            index={index}
            popoverAtom={plusPopoverAtom}
            newConversation={generateConversation}
            textAreaRef={textAreaRef}
            commandChar="+"
            placeholder="com_ui_add_model_preset"
            includeAssistants={false}
          />
          <Mention
            index={index}
            popoverAtom={mentionPopoverAtom}
            newConversation={newConversation}
            textAreaRef={textAreaRef}
          />
          <PromptsCommand index={index} textAreaRef={textAreaRef} submitPrompt={submitPrompt} />
          <div
            onClick={handleContainerClick}
            className={cn(
              'relative flex w-full flex-grow flex-col overflow-hidden rounded-t-3xl border pb-4 text-text-primary transition-all duration-200 sm:rounded-3xl sm:pb-0',
              isTextAreaFocused ? 'shadow-lg' : 'shadow-md',
              isTemporary
                ? 'border-violet-800/60 bg-violet-950/10'
                : 'border-border-light bg-surface-chat',
            )}
          >
            <TextareaHeader addedConvo={addedConvo} setAddedConvo={setAddedConvo} />
            {/* WIP */}
            <EditBadges
              isEditingChatBadges={isEditingBadges}
              handleCancelBadges={handleCancelBadges}
              handleSaveBadges={handleSaveBadges}
              setBadges={setBadges}
            />
            <FileFormChat
              conversation={conversation}
              files={files}
              setFiles={setFiles}
              setFilesLoading={setFilesLoading}
            />
            {endpoint && (
              <div className={cn('flex', isRTL ? 'flex-row-reverse' : 'flex-row')}>
                <div
                  className="relative flex-1"
                  style={
                    isCollapsed
                      ? {
                          WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 90%)',
                          maskImage: 'linear-gradient(to bottom, black 60%, transparent 90%)',
                        }
                      : undefined
                  }
                >
                  <TextareaAutosize
                    {...registerProps}
                    ref={(e) => {
                      ref(e);
                      (textAreaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current =
                        e;
                    }}
                    disabled={disableInputs || isNotAppendable}
                    onPaste={handlePaste}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    id={mainTextareaId}
                    tabIndex={0}
                    data-testid="text-input"
                    rows={1}
                    onFocus={handleTextareaFocus}
                    onBlur={handleTextareaBlur}
                    aria-label={localize('com_ui_message_input')}
                    onClick={handleFocusOrClick}
                    style={{ height: 44, overflowY: 'auto' }}
                    className={cn(
                      baseClasses,
                      removeFocusRings,
                      'scrollbar-hover transition-[max-height] duration-200 disabled:cursor-not-allowed',
                    )}
                  />
                </div>
                <div className="flex flex-col items-start justify-start pr-2.5 pt-1.5">
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
                '@container items-between flex gap-2 pb-2',
                isRTL ? 'flex-row-reverse' : 'flex-row',
              )}
            >
              <div className={`${isRTL ? 'mr-2' : 'ml-2'}`}>
                <AttachFileChat
                  conversation={conversation}
                  disableInputs={disableInputs}
                  files={files}
                  setFiles={setFiles}
                  setFilesLoading={setFilesLoading}
                />
              </div>
              <BadgeRow
                showEphemeralBadges={
                  !!endpoint && !isAgentsEndpoint(endpoint) && !isAssistantsEndpoint(endpoint)
                }
                isSubmitting={isSubmitting}
                conversationId={conversationId}
                specName={conversation?.spec}
                onChange={setBadges}
                isInChat={
                  Array.isArray(conversation?.messages) && conversation.messages.length >= 1
                }
              />
              <div className="mx-auto flex" />
              {SpeechToText && (
                <AudioRecorder
                  methods={methods}
                  ask={submitMessage}
                  textAreaRef={textAreaRef}
                  disabled={disableInputs || isNotAppendable}
                  isSubmitting={isSubmitting}
                />
              )}
              <div className={`${isRTL ? 'ml-2' : 'mr-2'}`}>
                {isSubmitting && showStopButton ? (
                  <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
                ) : (
                  endpoint && (
                    <SendButton
                      ref={submitButtonRef}
                      control={methods.control}
                      disabled={filesLoading || isSubmitting || disableInputs || isNotAppendable}
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
ChatForm.displayName = 'ChatForm';

/**
 * Wrapper that subscribes to ChatContext and passes stable individual values
 * to the memo'd ChatForm. This prevents ChatForm from re-rendering on every
 * streaming chunk — it only re-renders when the specific values it uses change.
 */
function ChatFormWrapper({ index = 0 }: { index?: number }) {
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

  /**
   * Stabilize conversation reference: only update when rendering-relevant fields change,
   * not on every metadata update (e.g., title generation during streaming).
   */
  const hasMessages = (conversation?.messages?.length ?? 0) > 0;
  const stableConversation = useMemo(
    () => conversation,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      conversation?.conversationId,
      conversation?.endpoint,
      conversation?.endpointType,
      conversation?.agent_id,
      conversation?.assistant_id,
      conversation?.spec,
      conversation?.useResponsesApi,
      conversation?.model,
      hasMessages,
    ],
  );

  /** Stabilize function refs so they never trigger ChatForm re-renders */
  const handleStopRef = useRef(handleStopGenerating);
  handleStopRef.current = handleStopGenerating;
  const stableHandleStop = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => handleStopRef.current(e),
    [],
  );

  const newConvoRef = useRef(newConversation);
  newConvoRef.current = newConversation;
  const stableNewConversation: ConvoGenerator = useCallback(
    (...args: Parameters<ConvoGenerator>): ReturnType<ConvoGenerator> =>
      newConvoRef.current(...args),
    [],
  );

  return (
    <ChatForm
      index={index}
      files={files}
      setFiles={setFiles}
      conversation={stableConversation}
      isSubmitting={isSubmitting}
      filesLoading={filesLoading}
      setFilesLoading={setFilesLoading}
      newConversation={stableNewConversation}
      handleStopGenerating={stableHandleStop}
    />
  );
}

ChatFormWrapper.displayName = 'ChatFormWrapper';

export default ChatFormWrapper;
