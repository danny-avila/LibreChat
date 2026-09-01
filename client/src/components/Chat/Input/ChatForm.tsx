import { memo, useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useWatch } from 'react-hook-form';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Constants, isAssistantsEndpoint, isAgentsEndpoint } from 'librechat-data-provider';
import { composerSurfaceClasses, composerSurfaceShadow, TextareaAutosize } from '@librechat/client';
import type { TChatProject, TMessage, TConversation } from 'librechat-data-provider';
import type { ExtendedFile, FileSetter, ConvoGenerator, TAskFunction } from '~/common';
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
  BadgeRowProvider,
} from '~/Providers';
import useComposerRestore from '~/hooks/Input/useComposerRestore';
import usePastedTextEdit from '~/hooks/Files/usePastedTextEdit';
import useAskAnswerMode from '~/hooks/Input/useAskAnswerMode';
import AskUserQuestionPopover from './AskUserQuestionPopover';
import useComposerItems from '~/hooks/Input/useComposerItems';
import useAttachTarget from '~/hooks/Input/useAttachTarget';
import InterruptSteerButton from './InterruptSteerButton';
import Hints, { composerHintId } from './Composer/Hints';
import PastedTextDialog from './Files/PastedTextDialog';
import DuringRunSendButton from './DuringRunSendButton';
import ProjectLandingChip from '../ProjectLandingChip';
import useDictation from '~/hooks/Input/useDictation';
import { useGetStartupConfig } from '~/data-provider';
import useSteering from '~/hooks/Chat/useSteering';
import TextareaHeader from './TextareaHeader';
import PromptsCommand from './PromptsCommand';
import SkillsCommand from './SkillsCommand';
import AutoPlayAudio from './AutoPlayAudio';
import Waveform from './Composer/Waveform';
import CollapseChat from './CollapseChat';
import { mainTextareaId } from '~/common';
import QuoteButton from './QuoteButton';
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
  /** Last measured row count, so an unchanged measurement never schedules a
   *  render at all rather than relying on a state-equality bailout. */
  const measuredRowCountRef = useRef(1);

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
  const filesLoading = useMemo(() => hasIncompleteFiles(files), [files]);
  /** Agents and assistants carry their own tool configuration, so the composer's
   *  ephemeral tool controls only apply elsewhere, and a spec can suppress them
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
   * which the Assistants endpoints bypass, so hide the UI there rather than
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
        overrideReasoning: context?.reasoningOverride ?? null,
        overrideClientRequestId: context?.clientRequestId,
        overrideRecoverySteerId: context?.recoverySteerId,
        overrideExpectedPredecessorCreatedAt: context?.expectedPredecessorCreatedAt,
        overrideQueuedMessageOrigin: context?.queuedMessageOrigin,
      }),
    [submitMessage],
  );
  const { editToComposer, restoreReclaimedSteer } = useComposerRestore({
    conversationId,
    methods,
    files,
    setFiles,
    textAreaRef,
    answerModeActive: composerReserved,
  });
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

  /** ⌘/Ctrl+Enter = the non-default during-run action, ⌥/Alt+Enter =
   *  interrupt & send (discards the answer), ⌘/Ctrl+Shift+Enter = interrupt &
   *  steer (keeps it): all counterparts of Enter's `submitDuringRun`. */
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
    disabled: disableInputs || answerMode.composerLocked,
    // The composer IS the free-form answer box while a question pause is live.
    placeholder: composerReserved ? answerPlaceholder : placeholder,
    // Enter stays live during a run when it can steer/queue instead of send.
    allowSubmitWhileGenerating: steering.duringRunActive || answerMode.composerAnswers,
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

  /** The composer commits once per keystroke for the row count and the send
   *  button; a second commit for a row count that did not move (or that no
   *  layout engine can measure, where `lineHeight` is not a number) doubles the
   *  cost of the app's busiest surface for nothing. */
  useEffect(() => {
    const textarea = textAreaRef.current;
    if (!textarea) {
      return;
    }
    const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight);
    if (!(lineHeight > 0)) {
      return;
    }
    const nextRowCount = Math.floor(textarea.scrollHeight / lineHeight);
    if (nextRowCount === measuredRowCountRef.current) {
      return;
    }
    measuredRowCountRef.current = nextRowCount;
    setVisualRowCount(nextRowCount);
  }, [textValue]);

  const isMoreThanThreeRows = visualRowCount > 3;

  const composerItems = useComposerItems(conversationId, quotesEnabled);
  const attachTarget = useAttachTarget(conversation, disableInputs);
  const { submitText: submitAnswerText } = answerMode;
  const dictationAnswerModeActive = answerMode.composerAnswers;
  /** The same gate `onSubmit` applies: while a question pause is live the
   *  composer IS the answer box, so a dictated turn has to answer it rather
   *  than start a turn the paused run would drop. */
  const dictationAsk = useCallback<TAskFunction>(
    (props) => {
      if (dictationAnswerModeActive && submitAnswerText(props.text)) {
        return;
      }
      return submitMessage({ text: props.text });
    },
    [dictationAnswerModeActive, submitAnswerText, submitMessage],
  );
  const dictation = useDictation({
    ask: dictationAsk,
    methods,
    /* Answer mode leaves the run submitting while handing the composer over,
       which is exactly when speech must still reach it: the send button is
       enabled on the same terms. */
    isSubmitting: (isSubmitting && !dictationAnswerModeActive) || answerMode.composerLocked,
    filesLoading,
    /* A dictated question answer is cleared by answer mode only after the
       resume succeeds. A transient failure must leave the transcript intact. */
    deferComposerReset: dictationAnswerModeActive,
  });
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
  /* Memoized for `memo(Bar)`: an inline element is a new identity every render,
     and this component re-renders on every keystroke. */
  const duringRunSlot = useMemo(() => {
    const sendOwnsSlot = steering.duringRunActive && (textValue?.trim() ?? '') !== '';
    /* Stays mounted (hidden) behind the during-run send button: the stop
       shortcut resolves against the focused form, so a half-typed steer would
       otherwise leave it reaching into another pane or doing nothing. */
    const stopButton = showStopButton ? (
      <StopButton
        stop={handleStopGenerating}
        setShowStopButton={setShowStopButton}
        /* The abort is generation-scoped and inert until the start POST
           installs the epoch; assistants abort through their own path and
           need no epoch. */
        canStop={steering.canControlGeneration || isAssistantsEndpoint(endpoint)}
        hidden={sendOwnsSlot}
      />
    ) : null;
    if (sendOwnsSlot) {
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
          {stopButton}
        </>
      );
    }
    return stopButton;
  }, [
    steering,
    textValue,
    methods,
    submitButtonRef,
    filesLoading,
    showStopButton,
    handleStopGenerating,
    setShowStopButton,
    endpoint,
  ]);

  /* Memoized for `memo(Bar)`: an inline element is a new identity every render,
     and this component re-renders on every keystroke. */
  /* Gated on the slot having something to show rather than on `showStopButton`:
     that flag only flips once the start POST installs the generation epoch, and
     until then Enter already queues while this slot still offered the ordinary
     send button, disabled. The slot decides for itself between the during-run
     control, Stop, and nothing, so an empty one falls through to send. */
  const actionSlot = useMemo(
    () =>
      isSubmitting && !answerMode.composerAnswers && duringRunSlot != null
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
          ),
    [
      endpoint,
      duringRunSlot,
      filesLoading,
      disableInputs,
      isNotAppendable,
      isSubmitting,
      answerMode.composerAnswers,
      answerMode.composerLocked,
      submittableFileCount,
      methods.control,
    ],
  );

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
          propagates all the way up here: the composer stretched past the
          thread and its chips ran off the side. Zeroing it lets the width come
          from the form, so the chips inside truncate instead. */}
      <div className="relative flex h-full min-w-0 flex-1 items-stretch md:flex-col">
        {/* Primary composer owns the selection popup so split-view doesn't double it. */}
        {index === 0 && quotesEnabled && <QuoteButton conversationId={conversationId} />}
        <div className="relative flex w-full flex-col">
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
                'relative flex w-full flex-grow flex-col overflow-hidden rounded-t-3xl pb-4 sm:rounded-3xl sm:pb-0',
                composerSurfaceClasses(),
                isTextAreaFocused ? composerSurfaceShadow.focused : composerSurfaceShadow.blurred,
                isTemporary && 'bg-surface-active',
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
                index={index}
                isPastedTextFile={isPastedTextFile}
                isPasteActionPending={isPasteActionPending}
                onEditPastedText={pastedTextEdit.openEditor}
                onMovePastedTextInline={pastedTextEdit.moveInline}
              />
              <PastedTextDialog
                edit={pastedTextEdit.editing}
                onClose={pastedTextEdit.closeEditor}
                onSave={pastedTextEdit.saveEdit}
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
                      aria-describedby={composerHintId(index)}
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
                        active={dictation.active}
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
                  /* The RAW endpoint, not the effective type above: the attach
                     destinations resolve the provider from its name, so a
                     custom endpoint reduced to `custom` loses the uploads its
                     provider actually takes (OpenRouter's video and audio).
                     `endpointType` beside it carries the resolved type. */
                  endpoint={conversation?.endpoint}
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
                  speechDisabled={disableInputs || isNotAppendable || answerMode.composerLocked}
                  dictation={dictation}
                  actionSlot={actionSlot}
                  hasAddedConversation={addedConvo != null}
                />
                <ToolDialogs />
              </BadgeRowProvider>
              {TextToSpeech && automaticPlayback && <AutoPlayAudio index={index} />}
            </div>
          </div>
          {/* Sibling of the composer row, not a child: inside that flex-row it
              would lay out as a narrow column beside the box. */}
          <Hints
            index={index}
            hasText={(textValue?.trim() ?? '') !== ''}
            isSubmitting={isSubmitting}
            duringRunActive={steering.duringRunActive}
            canControlGeneration={steering.canControlGeneration}
            duringRunAction={steering.effectiveAction}
            canSteer={steering.canSteer}
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
 * streaming chunk: it only re-renders when the specific values it uses change.
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
