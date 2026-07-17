import { memo, useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWatch } from 'react-hook-form';
import { TextareaAutosize } from '@librechat/client';
import { useRecoilState, useRecoilValue, useRecoilCallback, useSetRecoilState } from 'recoil';
import { Constants, isAssistantsEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import type { TMessage, TConversation } from 'librechat-data-provider';
import type { ExtendedFile, FileSetter, ConvoGenerator } from '~/common';
import type { QueuedMessageContext } from '~/hooks/Chat/useSteering';
import {
  useTextarea,
  useAutoSave,
  useLocalize,
  useRequiresKey,
  useHandleKeyUp,
  useQueryParams,
  useSubmitMessage,
  useFocusChatEffect,
  useAuthContext,
} from '~/hooks';
import { v4 } from 'uuid';
import {
  useChatContext,
  useChatFormContext,
  useAddedChatContext,
  useAssistantsMapContext,
} from '~/Providers';
import PendingManualSkillsChips from './PendingManualSkillsChips';
import useAskAnswerMode from '~/hooks/Input/useAskAnswerMode';
import AskUserQuestionPopover from './AskUserQuestionPopover';
import { cn, getModelSpec, removeFocusRings } from '~/utils';
import DuringRunSendButton from './DuringRunSendButton';
import { useGetStartupConfig } from '~/data-provider';
import { mainTextareaId, BadgeItem } from '~/common';
import PendingSteerChips from './PendingSteerChips';
import PendingQuoteChips from './PendingQuoteChips';
import AttachFileChat from './Files/AttachFileChat';
import useSteering from '~/hooks/Chat/useSteering';
import FileFormChat from './Files/FileFormChat';
import InFlightSteers from './InFlightSteers';
import TextareaHeader from './TextareaHeader';
import PromptsCommand from './PromptsCommand';
import SkillsCommand from './SkillsCommand';
import AudioRecorder from './AudioRecorder';
import CollapseChat from './CollapseChat';
import QuoteButton from './QuoteButton';
import StreamAudio from './StreamAudio';
import TokenUsage from './TokenUsage';
import StopButton from './StopButton';
import SendButton from './SendButton';
import EditBadges from './EditBadges';
import BadgeRow from './BadgeRow';
import Mention from './Mention';
import VideoCallButton from './VideoCallButton';
import VideoCallOverlay from '../VideoCallOverlay';
import { useVideoCall } from '~/hooks/useVideoCall';
import store from '~/store';

interface ChatFormProps {
  index: number;
  placeholder?: string;
  /** From ChatContext — individual values so memo can compare them */
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  conversation: TConversation | null;
  isSubmitting: boolean;
  filesLoading: boolean;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  newConversation: ConvoGenerator;
  handleStopGenerating: (e: React.MouseEvent<HTMLButtonElement>) => void;
  stopGenerating: () => void;
}

const ChatForm = memo(function ChatForm({
  index,
  placeholder,
  files,
  setFiles,
  conversation,
  isSubmitting,
  filesLoading,
  setFilesLoading,
  newConversation,
  handleStopGenerating,
  stopGenerating,
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
  const {
    generateConversation,
    conversation: addedConvo,
    setConversation: setAddedConvo,
  } = useAddedChatContext();
  const assistantMap = useAssistantsMapContext();
  const { data: startupConfig } = useGetStartupConfig();

  const endpoint = useMemo(
    () => conversation?.endpointType ?? conversation?.endpoint,
    [conversation?.endpointType, conversation?.endpoint],
  );
  const modelSpec = useMemo(
    () => getModelSpec({ specName: conversation?.spec, startupConfig }),
    [conversation?.spec, startupConfig],
  );
  const hideBadgeRow = modelSpec?.hideBadgeRow === true;
  const conversationId = useMemo(
    () => conversation?.conversationId ?? Constants.NEW_CONVO,
    [conversation?.conversationId],
  );
  /**
   * The quote feature merges excerpts server-side in `BaseClient.sendMessage`,
   * which the Assistants endpoints bypass — so hide the UI there rather than
   * letting users queue quotes the assistant never receives.
   */
  const quotesEnabled = useMemo(() => !isAssistantsEndpoint(endpoint), [endpoint]);

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
    () => requiresKey || invalidAssistant,
    [requiresKey, invalidAssistant],
  );

  const { token: jwtToken } = useAuthContext();
  const { setMessages, getMessages, latestMessageId } = useChatContext();

  const onAgentMessage = useCallback((text: string) => {
    if (!conversation?.conversationId) return;

    const parentMessageId = latestMessageId || '00000000-0000-0000-0000-000000000000';

    const messageId = v4();
    const messageData = {
      messageId,
      parentMessageId,
      text,
      sender: conversation.endpoint || 'assistant',
      isCreatedByUser: false,
      error: false,
      unfinished: false,
    };

    fetch(`/api/messages/${conversation.conversationId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwtToken}`,
      },
      body: JSON.stringify(messageData),
    })
      .then((res) => res.json())
      .then((savedMessage) => {
        const currentMessages = getMessages() || [];
        setMessages([...currentMessages, savedMessage]);
      })
      .catch((err) => console.error('Failed to save agent message:', err));
  }, [conversation?.conversationId, conversation?.endpoint, jwtToken, getMessages, setMessages, latestMessageId]);

  const navigate = useNavigate();
  const setConversation = useSetRecoilState(store.conversationByIndex(index));
  const { isCallActive, startCall, endCall, token, wsUrl } = useVideoCall();

  const handleStartCall = useCallback(() => {
    let activeId = conversation?.conversationId;
    if (activeId === 'new') {
      activeId = v4();
      setConversation((prev) => ({
        ...prev,
        conversationId: activeId,
      }));
      navigate(`/c/${activeId}`, { replace: true });
    }
    startCall(activeId, conversation?.endpoint);
  }, [conversation, startCall, setConversation, navigate]);

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

  const answerMode = useAskAnswerMode(conversationId);

  useAutoSave({
    files,
    setFiles,
    textAreaRef,
    conversationId,
    isSubmitting,
    // While a question pause is live the composer is the answer box: drafts
    // swap to the answer's own key, and the conversation draft is restored
    // when the question resolves.
    draftId: answerMode.draftId,
  });

  const { submitMessage, submitPrompt } = useSubmitMessage();

  /** Queued/steered sends carry their FULL submission context: explicit
   *  (possibly empty) overrides stop `ask` from vacuuming quotes or skill
   *  picks the user has staged in the composer for their NEXT message. */
  const sendNow = useCallback(
    (text: string, overrideFiles?: TMessage['files'], context?: QueuedMessageContext) =>
      submitMessage({
        text,
        overrideFiles,
        overrideQuotes: context?.quotes ?? [],
        overrideManualSkills: context?.manualSkills ?? [],
      }),
    [submitMessage],
  );
  /** Chip "Edit message" restore: quote chips + skill picks merge back into
   *  their compose-time atoms (the chips above the textarea re-render them). */
  const restoreComposerContext = useRecoilCallback(
    ({ set }) =>
      (context?: QueuedMessageContext) => {
        const { quotes, manualSkills } = context ?? {};
        if (quotes != null && quotes.length > 0) {
          set(store.pendingQuotesByConvoId(conversationId), (prev) => [
            ...new Set([...prev, ...quotes]),
          ]);
        }
        if (manualSkills != null && manualSkills.length > 0) {
          set(store.pendingManualSkillsByConvoId(conversationId), (prev) => [
            ...new Set([...prev, ...manualSkills]),
          ]);
        }
      },
    [conversationId],
  );
  /** Chip "Edit message": the text replaces the composer draft and the chip's
   *  attachments merge back into the composer file map (already uploaded, so
   *  they restore as completed entries — same shape as draft recovery). */
  const editToComposer = useCallback(
    (text: string, chipFiles?: TMessage['files'], context?: QueuedMessageContext) => {
      methods.setValue('text', text, { shouldDirty: true });
      if (chipFiles != null && chipFiles.length > 0) {
        setFiles((prev) => {
          const next = new Map(prev);
          for (const file of chipFiles) {
            if (!file.file_id) {
              continue;
            }
            next.set(file.file_id, {
              file_id: file.file_id,
              filename: file.filename,
              filepath: file.filepath,
              type: file.type ?? '',
              height: file.height,
              width: file.width,
              size: file.bytes ?? 0,
              progress: 1,
              attached: true,
            });
          }
          return next;
        });
      }
      restoreComposerContext(context);
      textAreaRef.current?.focus();
    },
    [methods, setFiles, restoreComposerContext],
  );
  const steering = useSteering({
    index,
    conversationId,
    conversation,
    isSubmitting,
    answerModeActive: answerMode.active,
    files,
    setFiles,
    filesLoading,
    sendNow,
    stopGenerating,
  });

  /** ⌘/Ctrl+Enter = the non-default during-run action, ⌥/Alt+Enter =
   *  interrupt & send — the counterpart of Enter's `submitDuringRun`. */
  const handleDuringRunModifier = useCallback(
    (kind: 'other' | 'interrupt') => {
      const text = methods.getValues('text');
      let consumed = false;
      if (kind === 'interrupt') {
        consumed = steering.interruptAndSend(text);
      } else if (steering.effectiveAction === 'steer') {
        consumed = steering.queueFromComposer(text);
      } else {
        consumed = steering.steerFromComposer(text);
      }
      if (consumed) {
        methods.reset();
      }
    },
    [methods, steering],
  );

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
    // The composer IS the free-form answer box while a question pause is live.
    placeholder: answerMode.active
      ? (answerMode.otherLabel ?? localize('com_ui_something_else'))
      : placeholder,
    // Enter stays live during a run when it can steer/queue instead of send.
    allowSubmitWhileGenerating: steering.duringRunActive,
    onDuringRunModifier: steering.duringRunActive ? handleDuringRunModifier : undefined,
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

  /** One button slot while a run is generating: with composer text the send
   *  button takes over (Enter steers/queues; hover reveals all actions);
   *  clearing the text restores Stop. */
  const duringRunSlot =
    steering.duringRunActive && (textValue?.trim() ?? '') !== '' ? (
      <DuringRunSendButton
        ref={submitButtonRef}
        control={methods.control}
        steering={steering}
        getText={() => methods.getValues('text')}
        onConsumed={() => methods.reset()}
        disabled={filesLoading}
      />
    ) : (
      <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
    );

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
      onSubmit={methods.handleSubmit((data) => {
        // Answer mode: composer text answers the paused run instead of
        // starting a new turn (submitText resets the composer itself).
        // Dismissing the popover restores normal sends.
        if (answerMode.active && answerMode.submitText(data.text)) {
          return;
        }
        // During a run, a submit steers or queues per the effective action
        // instead of starting a new turn (which would be dropped anyway).
        if (steering.duringRunActive) {
          if (steering.submitDuringRun(data.text)) {
            methods.reset();
          }
          return;
        }
        return submitMessage(data);
      })}
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
        {/* Primary composer owns the selection popup so split-view doesn't double it. */}
        {index === 0 && quotesEnabled && <QuoteButton conversationId={conversationId} />}
        <div className="flex w-full flex-col">
          {/* Run-scoped: `enabled` alone is any primary composer on a steerable
              endpoint, so a chip that outlives the run would strand a bubble. */}
          {steering.enabled && isSubmitting && <InFlightSteers conversationId={conversationId} />}
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
            {index === 0 && (
              <AskUserQuestionPopover conversationId={conversationId} textAreaRef={textAreaRef} />
            )}
            <SkillsCommand
              index={index}
              textAreaRef={textAreaRef}
              conversationId={conversationId}
              agentId={conversation?.agent_id}
            />
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
              <PendingManualSkillsChips conversationId={conversationId} />
              {quotesEnabled && <PendingQuoteChips conversationId={conversationId} />}
              {steering.enabled && (
                <PendingSteerChips
                  conversationId={conversationId}
                  steering={steering}
                  onEditToComposer={editToComposer}
                />
              )}
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
                            WebkitMaskImage:
                              'linear-gradient(to bottom, black 60%, transparent 90%)',
                            maskImage: 'linear-gradient(to bottom, black 60%, transparent 90%)',
                          }
                        : undefined
                    }
                  >
                    <TextareaAutosize
                      {...registerProps}
                      ref={(e) => {
                        ref(e);
                        (
                          textAreaRef as React.MutableRefObject<HTMLTextAreaElement | null>
                        ).current = e;
                      }}
                      disabled={disableInputs || isNotAppendable}
                      onPaste={handlePaste}
                      onKeyDown={(e) => {
                        // Answer mode consumes option-navigation keys from the
                        // empty composer; everything else follows the normal path.
                        if (answerMode.handleComposerKeyDown(e)) {
                          return;
                        }
                        handleKeyDown(e);
                      }}
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
                    !!endpoint &&
                    !hideBadgeRow &&
                    !isAgentsEndpoint(endpoint) &&
                    !isAssistantsEndpoint(endpoint)
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
                <TokenUsage index={index} conversation={conversation} isSubmitting={isSubmitting} />
                {SpeechToText && TextToSpeech && (
                  <VideoCallButton
                    disabled={disableInputs || isNotAppendable || isCallActive}
                    isSubmitting={isSubmitting}
                    onClick={handleStartCall}
                  />
                )}
                {SpeechToText && (
                  <AudioRecorder
                    methods={methods}
                    ask={submitMessage}
                    disabled={disableInputs || isNotAppendable || isCallActive}
                    isSubmitting={isSubmitting}
                  />
                )}
                <div className={`${isRTL ? 'ml-2' : 'mr-2'}`}>
                  {isSubmitting && showStopButton && !answerMode.active
                    ? duringRunSlot
                    : endpoint && (
                        <SendButton
                          ref={submitButtonRef}
                          control={methods.control}
                          disabled={
                            filesLoading ||
                            disableInputs ||
                            isNotAppendable ||
                            (isSubmitting && !answerMode.active)
                          }
                        />
                      )}
                </div>
              </div>
              {TextToSpeech && automaticPlayback && !isCallActive && <StreamAudio index={index} />}
            </div>
            {isCallActive && token && wsUrl && (
              <VideoCallOverlay token={token} wsUrl={wsUrl} onDisconnect={endCall} onAgentMessage={onAgentMessage} />
            )}
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
function ChatFormWrapper({ index = 0, placeholder }: { index?: number; placeholder?: string }) {
  const {
    files,
    setFiles,
    conversation,
    isSubmitting,
    filesLoading,
    setFilesLoading,
    newConversation,
    handleStopGenerating,
    stopGenerating,
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
      conversation?.maxContextTokens,
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

  const stopRef = useRef(stopGenerating);
  stopRef.current = stopGenerating;
  const stableStop = useCallback(() => {
    void stopRef.current();
  }, []);

  return (
    <ChatForm
      index={index}
      placeholder={placeholder}
      files={files}
      setFiles={setFiles}
      conversation={stableConversation}
      isSubmitting={isSubmitting}
      filesLoading={filesLoading}
      setFilesLoading={setFilesLoading}
      newConversation={stableNewConversation}
      handleStopGenerating={stableHandleStop}
      stopGenerating={stableStop}
    />
  );
}

ChatFormWrapper.displayName = 'ChatFormWrapper';

export default ChatFormWrapper;
