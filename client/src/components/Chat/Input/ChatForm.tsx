import { memo, useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useWatch } from 'react-hook-form';
import { useRecoilState, useRecoilValue, useRecoilCallback } from 'recoil';
import { Constants, isAssistantsEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import { composerSurfaceClasses, composerSurfaceShadow, TextareaAutosize } from '@librechat/client';
import type { TChatProject, TMessage, TConversation } from 'librechat-data-provider';
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
} from '~/hooks';
import {
  cn,
  getModelSpec,
  hasIncompleteFiles,
  removeFocusRings,
  getComposerDraftId,
  getFilesDraftCached,
  isPastedTextFileMarked,
} from '~/utils';
import {
  useChatContext,
  useChatFormContext,
  useAddedChatContext,
  useAssistantsMapContext,
} from '~/Providers';
import useAskAnswerMode from '~/hooks/Input/useAskAnswerMode';
import AskUserQuestionPopover from './AskUserQuestionPopover';
import InterruptSteerButton from './InterruptSteerButton';
import useComposerItems from '~/hooks/Input/useComposerItems';
import { cn, getModelSpec, removeFocusRings } from '~/utils';
import useAttachTarget from '~/hooks/Input/useAttachTarget';
import Hints, { COMPOSER_HINT_ID } from './Composer/Hints';
import DuringRunSendButton from './DuringRunSendButton';
import ProjectLandingChip from '../ProjectLandingChip';
import useDictation from '~/hooks/Input/useDictation';
import { useGetStartupConfig } from '~/data-provider';
import useSteering from '~/hooks/Chat/useSteering';
import { BadgeRowProvider } from '~/Providers';
import InFlightSteers from './InFlightSteers';
import TextareaHeader from './TextareaHeader';
import PromptsCommand from './PromptsCommand';
import SkillsCommand from './SkillsCommand';
import Waveform from './Composer/Waveform';
import CollapseChat from './CollapseChat';
import { mainTextareaId } from '~/common';
import QuoteButton from './QuoteButton';
import StreamAudio from './StreamAudio';
import ToolDialogs from './ToolDialogs';
import StopButton from './StopButton';
import SendButton from './SendButton';
import Queue from './Composer/Queue';
import Tray from './Composer/Tray';
import Bar from './Composer/Bar';
import Mention from './Mention';
import store from '~/store';

interface ChatFormProps {
  index: number;
  placeholder?: string;
  project?: TChatProject;
  /** From ChatContext: individual values so memo can compare them */
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  conversation: TConversation | null;
  isSubmitting: boolean;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  newConversation: ConvoGenerator;
  handleStopGenerating: (e: React.MouseEvent<HTMLButtonElement>) => void;
  stopGenerating: () => void;
}

const ChatForm = memo(function ChatForm({
  index,
  placeholder,
  project,
  files,
  setFiles,
  conversation,
  isSubmitting,
  setFilesLoading,
  newConversation,
  handleStopGenerating,
  stopGenerating,
}: ChatFormProps) {
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  /** The palette anchors to the whole composer, not to its own button, so it
   *  spans the composer width and sits flush above it. */
  const composerBoxRef = useRef<HTMLDivElement>(null);
  useFocusChatEffect(textAreaRef);
  const localize = useLocalize();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [, setIsScrollable] = useState(false);
  const [visualRowCount, setVisualRowCount] = useState(1);
  const [isTextAreaFocused, setIsTextAreaFocused] = useState(false);

  const SpeechToText = useRecoilValue(store.speechToText);
  const TextToSpeech = useRecoilValue(store.textToSpeech);
  const chatDirection = useRecoilValue(store.chatDirection);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);
  const isTemporary = useRecoilValue(store.isTemporary);

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
  /** Agents and assistants carry their own tool configuration, so the composer's
   *  ephemeral tool controls only apply elsewhere — and a spec can suppress them
   *  outright. Same gate the old `showEphemeralBadges` prop applied. */
  const showTools = useMemo(
    () =>
      !!endpoint &&
      modelSpec?.hideBadgeRow !== true &&
      !isAgentsEndpoint(endpoint) &&
      !isAssistantsEndpoint(endpoint),
    [endpoint, modelSpec?.hideBadgeRow],
  );
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
  const answerPlaceholder = answerMode.batchMode
    ? localize('com_ui_answer_questions_above')
    : (answerMode.otherLabel ?? localize('com_ui_something_else'));
  /** The composer is not a plain chat composer: it either IS this pause's
   *  answer box, or is locked behind the batch card that owns the answer. A
   *  collapsed batch is neither, it hands the composer back to the thread. */
  const composerReserved = answerMode.composerAnswers || answerMode.composerLocked;

  useAutoSave({
    index,
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

  const pastedTextEdit = usePastedTextEdit({ index, files, setFiles, textAreaRef });

  /** Provenance, not the filename, decides which chips are pastes: a user can deliberately
   * upload a `pasted-text.txt`. Restored provenance comes from the files draft; marks made
   * this session are read live from the registry, so new pastes need no recompute. */
  const pastedTextFileIds = useMemo(() => {
    const draftId = getComposerDraftId(index, conversationId, isSubmitting);
    const draftIds = getFilesDraftCached(draftId).pastedTextIds ?? [];
    return new Set<string>(draftIds);
  }, [index, conversationId, isSubmitting]);
  const isPastedTextFile = useCallback(
    (file: ExtendedFile) =>
      pastedTextFileIds.has(file.file_id) ||
      (file.temp_file_id != null && pastedTextFileIds.has(file.temp_file_id)) ||
      isPastedTextFileMarked(file.file_id) ||
      isPastedTextFileMarked(file.temp_file_id),
    [pastedTextFileIds],
  );
  /** The chip's actions hide while a replacement upload or inline move is in flight, so the
   * same original cannot be acted on twice. */
  const isPasteActionPending = useCallback(
    (file: ExtendedFile) => pastedTextEdit.isActionPending(file.file_id),
    [pastedTextEdit],
  );

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
        overrideClientRequestId: context?.clientRequestId,
        overrideRecoverySteerId: context?.recoverySteerId,
        overrideExpectedPredecessorCreatedAt: context?.expectedPredecessorCreatedAt,
        overrideQueuedMessageOrigin: context?.queuedMessageOrigin,
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
    answerModeActive: composerReserved,
    files,
    setFiles,
    filesLoading,
    sendNow,
    stopGenerating,
  });

  /** Read at call time, not captured: a reclaim resolves into the callback from
   *  the render it was clicked in, so the closure's `conversationId` is the OLD
   *  chat — comparing it against itself would pass while `methods` (one form,
   *  reused across conversations) writes into the chat now on screen. */
  const liveConversationIdRef = useRef(conversationId);
  liveConversationIdRef.current = conversationId;
  /** Same reason: attachments staged after the click must be seen. */
  const liveFilesRef = useRef(files);
  liveFilesRef.current = files;
  /** Same reason: the run can pause on `ask_user_question` mid-reclaim. */
  const liveAnswerModeRef = useRef(composerReserved);
  liveAnswerModeRef.current = composerReserved;
  /** A reclaim can resolve after this form unmounts (left the route, closed the
   *  pane). Its refs still hold the origin chat, so the restore would pass its
   *  checks and write into a dead form — reporting success and making the caller
   *  drop the steer, losing the text. Track mount so the restore refuses and the
   *  caller queues it instead. */
  const composerMountedRef = useRef(true);
  useEffect(
    () => () => {
      composerMountedRef.current = false;
    },
    [],
  );

  /** A draft is anything the user has staged, not just typed: `editToComposer`
   *  MERGES the steer's attachments into the composer's file map and its quotes
   *  and skill picks into their atoms, so restoring over staged context would
   *  glue the two submissions together. */
  const hasStagedComposerContext = useRecoilCallback(
    ({ snapshot }) =>
      (convoId: string) =>
        snapshot.getLoadable(store.pendingQuotesByConvoId(convoId)).getValue().length > 0 ||
        snapshot.getLoadable(store.pendingManualSkillsByConvoId(convoId)).getValue().length > 0,
    [],
  );

  /**
   * `editToComposer` for a steer whose reclaim was a round-trip: by the time it
   * resolves the composer may have moved on. Refuses (returning false, so the
   * caller re-homes the words instead of dropping them) rather than overwrite a
   * draft the user has since staged, or drop a steer into whatever chat they
   * navigated to.
   */
  const restoreReclaimedSteer = useCallback(
    (
      text: string,
      steerFiles: TMessage['files'],
      context: QueuedMessageContext,
      originConversationId: string,
    ): boolean => {
      if (!composerMountedRef.current) {
        return false;
      }
      const liveConversationId = liveConversationIdRef.current;
      if (originConversationId !== liveConversationId) {
        return false;
      }
      /** Answer mode owns the composer: `onSubmit` hands its text to
       *  `answerMode.submitText` before any send/steer routing, so restoring
       *  here would turn the steer into the tool's answer on the next Enter. */
      if (liveAnswerModeRef.current) {
        return false;
      }
      if (
        (methods.getValues('text') ?? '').trim().length > 0 ||
        (liveFilesRef.current?.size ?? 0) > 0 ||
        hasStagedComposerContext(liveConversationId)
      ) {
        return false;
      }
      editToComposer(text, steerFiles, context);
      return true;
    },
    [methods, editToComposer, hasStagedComposerContext],
  );

  /** ⌘/Ctrl+Enter = the non-default during-run action, ⌥/Alt+Enter =
   *  interrupt & send (discards the answer), ⌘/Ctrl+Shift+Enter = interrupt &
   *  steer (keeps it) — all counterparts of Enter's `submitDuringRun`. */
  const handleDuringRunModifier = useCallback(
    (kind: 'other' | 'interrupt' | 'preempt') => {
      const text = methods.getValues('text');
      let consumed = false;
      if (kind === 'interrupt') {
        consumed = steering.interruptAndSend(text);
      } else if (kind === 'preempt') {
        consumed = steering.interruptSteer(text);
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
    placeholder: composerReserved ? answerPlaceholder : placeholder,
    // Enter stays live during a run when it can steer/queue instead of send.
    allowSubmitWhileGenerating: steering.duringRunActive,
    onDuringRunModifier: steering.duringRunActive ? handleDuringRunModifier : undefined,
    answerModeActive: answerMode.composerAnswers,
  });

  useQueryParams({ textAreaRef });

  /** Attachments stand in for text only on the normal send path. Answer mode
   *  hands the composer text straight to the paused run, which answers with
   *  values and cannot consume files, so an empty draft must stay unsubmittable
   *  there rather than enabling a button whose submit is silently dropped. */
  const submittableFileCount = composerReserved ? 0 : files.size;

  const { ref, ...registerProps } = methods.register('text', {
    required: submittableFileCount === 0,
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

  const isMoreThanThreeRows = visualRowCount > 3;

  const composerItems = useComposerItems(conversationId);
  const attachTarget = useAttachTarget(conversation, disableInputs);
  const dictation = useDictation({ ask: submitMessage, methods, isSubmitting });
  const uploadingCount = useMemo(() => {
    let count = 0;
    for (const file of files.values()) {
      if (file.progress < 1) {
        count++;
      }
    }
    return count;
  }, [files]);

  /** One button slot while a run is generating: with composer text the send
   *  button takes over (Enter steers/queues; hover reveals all actions);
   *  clearing the text restores Stop. */
  const duringRunSlot = (() => {
    if (steering.duringRunActive && (textValue?.trim() ?? '') !== '') {
      return (
        <>
          {steering.canControlGeneration && (
            <InterruptSteerButton
              steering={steering}
              getText={() => methods.getValues('text')}
              onConsumed={() => methods.reset()}
              disabled={filesLoading}
            />
          )}
          <DuringRunSendButton
            ref={submitButtonRef}
            control={methods.control}
            steering={steering}
            getText={() => methods.getValues('text')}
            onConsumed={() => methods.reset()}
            disabled={filesLoading}
          />
        </>
      );
    }
    if (showStopButton) {
      return <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />;
    }
    return null;
  })();

  /* The empty-conversation screen. Drives both how far the composer floats off
     the bottom and whether the ambient tips under it are worth their row. */
  const isLanding =
    (conversationId == null || conversationId === Constants.NEW_CONVO) &&
    !isSubmitting &&
    (conversation?.messages?.length ?? 0) === 0;

  const baseClasses = useMemo(
    () =>
      cn(
        'md:py-3.5 m-0 w-full resize-none py-[13px] placeholder:text-text-tertiary bg-transparent [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]',
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
        // Dismissing the popover — or collapsing a batch, which answers in its
        // own card — restores normal sends.
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
        /* In a conversation the composer sits close to the edge: the thread is
           what the space belongs to, and the footer below already separates it
           from the window. The landing screen keeps its float. */
        centerFormOnLanding && isLanding ? 'transition-all duration-200 sm:mb-36' : 'sm:mb-8',
      )}
    >
      {/* `min-w-0`: a flex item's automatic minimum size is its content's
          min-content width, and one long unbroken word in a queued message
          propagates all the way up here — the composer stretched past the
          thread and its chips ran off the side. Zeroing it lets the width come
          from the form, so the chips inside truncate instead. */}
      <div className="relative flex h-full min-w-0 flex-1 items-stretch md:flex-col">
        {/* Primary composer owns the selection popup so split-view doesn't double it. */}
        {index === 0 && quotesEnabled && <QuoteButton conversationId={conversationId} />}
        {/* `relative` anchors the in-flight steer overlay, which floats above
            the composer (`bottom-full`) over the bottom of the thread. */}
        <div className="relative flex w-full flex-col">
          {/* Run-scoped: `enabled` alone is any primary composer on a steerable
              endpoint, so a chip that outlives the run would strand a bubble. */}
          {steering.enabled && isSubmitting && (
            <InFlightSteers
              steering={steering}
              conversationId={conversationId}
              onRestoreToComposer={restoreReclaimedSteer}
            />
          )}
          {steering.enabled && (
            <Queue
              steering={steering}
              conversationId={conversationId}
              onEditToComposer={editToComposer}
              onRestoreToComposer={restoreReclaimedSteer}
            />
          )}
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
              ref={composerBoxRef}
              onClick={handleContainerClick}
              className={cn(
                /* Flat by default with a border-strength step on focus, rather
                   than a growing shadow — both reference composers sit flush
                   with the page instead of floating over it. */
                'relative flex w-full flex-grow flex-col overflow-hidden rounded-t-3xl border pb-4 text-text-primary transition-all duration-200 sm:rounded-3xl sm:pb-0',
                isTextAreaFocused && 'ring-1',
                isTemporary
                  ? cn(
                      'border-violet-800/60 bg-violet-950/10',
                      isTextAreaFocused && 'border-violet-700 ring-violet-800/40',
                    )
                  : cn(
                      'bg-surface-chat',
                      isTextAreaFocused
                        ? 'border-border-medium ring-border-light'
                        : 'border-border-light',
                     ),
              )}
            >
              {project ? <ProjectLandingChip project={project} /> : null}
              <TextareaHeader addedConvo={addedConvo} setAddedConvo={setAddedConvo} />
              <Tray
                items={composerItems}
                conversation={conversation}
                files={files}
                setFiles={setFiles}
                setFilesLoading={setFilesLoading}
                isRTL={isRTL}
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
                      disabled={disableInputs || isNotAppendable || answerMode.composerLocked}
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
                      aria-describedby={COMPOSER_HINT_ID}
                      onClick={handleFocusOrClick}
                      style={{ height: 44, overflowY: 'auto' }}
                      className={cn(
                        baseClasses,
                        removeFocusRings,
                        'scrollbar-hover transition-[max-height] duration-200 disabled:cursor-not-allowed',
                      )}
                    />
                    {dictation.active && (textValue?.trim() ?? '') === '' && (
                      /* Stands in for the placeholder: same inset, same line, so
                         it reads as the input listening rather than as a widget
                         bolted on. Once words arrive the transcript takes over. */
                      <Waveform
                        levels={dictation.levels}
                        className={cn(
                          'pointer-events-none absolute inset-y-0 h-full',
                          isMoreThanThreeRows ? 'left-5 right-2' : 'inset-x-5',
                        )}
                      />
                    )}
                    {/* Sits over the fade scrim in the corner of the input
                        rather than in its own column beside it, so a long draft
                        does not push an orphaned control off to the side. */}
                    <div className="absolute bottom-1 right-2 z-10">
                      <CollapseChat
                        isCollapsed={isCollapsed}
                        isScrollable={isMoreThanThreeRows}
                        setIsCollapsed={setIsCollapsed}
                      />
                    </div>
                  </div>
                </div>
              )}
              <BadgeRowProvider
                conversationId={conversationId}
                specName={conversation?.spec}
                isSubmitting={isSubmitting}
              >
                <Bar
                  index={index}
                  isRTL={isRTL}
                  disabled={disableInputs}
                  agentId={conversation?.agent_id}
                  endpoint={endpoint}
                  endpointType={attachTarget.endpointType}
                  endpointFileConfig={attachTarget.endpointFileConfig}
                  useResponsesApi={attachTarget.useResponsesApi}
                  conversationId={conversationId}
                  conversation={conversation}
                  files={files}
                  setFiles={setFiles}
                  setFilesLoading={setFilesLoading}
                  canAttach={attachTarget.canAttach}
                  anchorRef={composerBoxRef}
                  showTools={showTools}
                  isSubmitting={isSubmitting}
                  showSpeech={SpeechToText}
                  speechDisabled={
                    disableInputs || isNotAppendable || answerMode.composerLocked
                  }
                  dictation={dictation}
                  actionSlot={
                    isSubmitting &&
                    (showStopButton || steering.duringRunActive) &&
                    !answerMode.composerAnswers
                      ? duringRunSlot
                      : endpoint && (
                          <SendButton
                            ref={submitButtonRef}
                            control={methods.control}
                            fileCount={submittableFileCount}
                            disabled={
                              filesLoading ||
                              disableInputs ||
                              isNotAppendable ||
                              answerMode.composerLocked ||
                              (isSubmitting && !answerMode.composerAnswers)
                            }
                          />
                        )
                  }
                />
                <ToolDialogs />
              </BadgeRowProvider>
              {TextToSpeech && automaticPlayback && <StreamAudio index={index} />}
            </div>
          </div>
          {/* Sibling of the composer row, not a child: inside that flex-row it
              would lay out as a narrow column beside the box. */}
          <Hints
            hasText={(textValue?.trim() ?? '') !== ''}
            isSubmitting={isSubmitting}
            duringRunActive={steering.duringRunActive}
            duringRunAction={steering.effectiveAction}
            answerModeActive={answerMode.active}
            uploadingCount={uploadingCount}
          />
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
function ChatFormWrapper({
  index = 0,
  placeholder,
  project,
}: {
  index?: number;
  placeholder?: string;
  project?: TChatProject;
}) {
  const {
    files,
    setFiles,
    conversation,
    isSubmitting,
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
      project={project}
      files={files}
      setFiles={setFiles}
      conversation={stableConversation}
      isSubmitting={isSubmitting}
      setFilesLoading={setFilesLoading}
      newConversation={stableNewConversation}
      handleStopGenerating={stableHandleStop}
      stopGenerating={stableStop}
    />
  );
}

ChatFormWrapper.displayName = 'ChatFormWrapper';

export default ChatFormWrapper;
