import { memo, useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useWatch } from 'react-hook-form';
import { TextareaAutosize, Button } from '@librechat/client';
import { useRecoilState, useRecoilValue } from 'recoil';
import {
  Constants,
  isAssistantsEndpoint,
  isAgentsEndpoint,
  EModelEndpoint,
  alternateName,
} from 'librechat-data-provider';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import { AlertTriangle, KeyRound } from 'lucide-react';
import {
  useChatContext,
  useChatFormContext,
  useAddedChatContext,
  useAssistantsMapContext,
  useAgentsMapContext,
} from '~/Providers';
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
import { mainTextareaId, BadgeItem } from '~/common';
import AttachFileChat from './Files/AttachFileChat';
import FileFormChat from './Files/FileFormChat';
import { cn, removeFocusRings, getEndpointField } from '~/utils';
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
import { SetKeyDialog } from '~/components/Input/SetKeyDialog';
import { useGetEndpointsQuery } from '~/data-provider';

const ChatForm = memo(({ index = 0 }: { index?: number }) => {
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  useFocusChatEffect(textAreaRef);
  const localize = useLocalize();

  const { data: endpointsConfig } = useGetEndpointsQuery();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [, setIsScrollable] = useState(false);
  const [visualRowCount, setVisualRowCount] = useState(1);
  const [isTextAreaFocused, setIsTextAreaFocused] = useState(false);
  const [backupBadges, setBackupBadges] = useState<Pick<BadgeItem, 'id'>[]>([]);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);

  const SpeechToText = useRecoilValue(store.speechToText);
  const TextToSpeech = useRecoilValue(store.textToSpeech);
  const chatDirection = useRecoilValue(store.chatDirection);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);
  const isTemporary = useRecoilValue(store.isTemporary);
  const modelAvailability = useRecoilValue(store.modelAvailability);

  const [badges, setBadges] = useRecoilState(store.chatBadges);
  const [isEditingBadges, setIsEditingBadges] = useRecoilState(store.isEditingBadges);
  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
  const [showPlusPopover, setShowPlusPopover] = useRecoilState(store.showPlusPopoverFamily(index));
  const [showMentionPopover, setShowMentionPopover] = useRecoilState(
    store.showMentionPopoverFamily(index),
  );

  const { requiresKey, endpoint: keyEndpoint, endpointType, endpointLabel, expiryTime, isExpired } =
    useRequiresKey();
  const methods = useChatFormContext();
  const {
    files,
    setFiles,
    conversation,
    isSubmitting,
    filesLoading,
    newConversation,
    handleStopGenerating,
    latestMessage,
    resetLatestMessage,
  } = useChatContext();
  const {
    addedIndex,
    generateConversation,
    conversation: addedConvo,
    setConversation: setAddedConvo,
    isSubmitting: isSubmittingAdded,
  } = useAddedChatContext();
  const assistantMap = useAssistantsMapContext();
  const agentsMap = useAgentsMapContext();
  const showStopAdded = useRecoilValue(store.showStopButtonByIndex(addedIndex));
  const modelsQuery = useGetModelsQuery();
  const { data: modelsData, isSuccess: modelsLoaded, isError: modelsError } = modelsQuery;

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
  const invalidAgent = useMemo(
    () =>
      isAgentsEndpoint(endpoint) &&
      agentsMap !== undefined &&
      (!(conversation?.agent_id ?? '') || !agentsMap?.[conversation?.agent_id ?? '']),
    [conversation?.agent_id, endpoint, agentsMap],
  );
  const providerLabel = useMemo(() => {
    const endpointKey = conversation?.endpoint ?? conversation?.endpointType ?? '';
    if (!endpointKey) {
      return localize('com_endpoint_ai');
    }

    return (alternateName as Record<string, string>)[endpointKey] ?? endpointKey;
  }, [conversation?.endpoint, conversation?.endpointType, localize]);
  const { message: readinessMessage, shouldDisable: shouldDisableForAvailability } = useMemo(() => {
    if (requiresKey) {
      return { message: null, shouldDisable: false };
    }

    if (!endpoint) {
      return {
        message: localize('com_error_missing_model', { 0: providerLabel }),
        shouldDisable: true,
      };
    }

    if (invalidAssistant || invalidAgent) {
      return {
        message: localize('com_error_missing_model', { 0: providerLabel }),
        shouldDisable: true,
      };
    }

    if (isAgentsEndpoint(endpoint)) {
      const agentId = conversation?.agent_id ?? '';
      if (!agentId) {
        return {
          message: localize('com_error_missing_model', { 0: providerLabel }),
          shouldDisable: true,
        };
      }

      if (agentsMap !== undefined && !agentsMap?.[agentId]) {
        return {
          message: localize('com_error_endpoint_models_not_loaded', { 0: providerLabel }),
          shouldDisable: true,
        };
      }

      return { message: null, shouldDisable: false };
    }

    if (isAssistantsEndpoint(endpoint)) {
      const assistantId = conversation?.assistant_id ?? '';
      if (!assistantId) {
        return {
          message: localize('com_error_missing_model', { 0: providerLabel }),
          shouldDisable: true,
        };
      }

      return { message: null, shouldDisable: false };
    }

    if (!conversation?.model) {
      return {
        message: localize('com_error_missing_model', { 0: providerLabel }),
        shouldDisable: true,
      };
    }

    if (modelsError) {
      return {
        message: localize('com_error_models_not_loaded'),
        shouldDisable: true,
      };
    }

    if (modelsLoaded) {
      const endpointsToCheck = new Set<string>();
      if (conversation?.endpoint) {
        endpointsToCheck.add(conversation.endpoint);
      }
      if (conversation?.endpointType) {
        endpointsToCheck.add(conversation.endpointType);
      }
      if (endpoint) {
        endpointsToCheck.add(endpoint);
      }

      const aggregatedModels = new Set<string>();
      endpointsToCheck.forEach((key) => {
        const modelList = modelsData?.[key];
        if (Array.isArray(modelList)) {
          modelList.forEach((model) => aggregatedModels.add(model));
        }
      });

      if (aggregatedModels.size === 0) {
        return {
          message: localize('com_error_endpoint_models_not_loaded', { 0: providerLabel }),
          shouldDisable: true,
        };
      }

      if (!aggregatedModels.has(conversation.model)) {
        return {
          message: localize('com_error_missing_model', { 0: providerLabel }),
          shouldDisable: true,
        };
      }
    }

    return { message: null, shouldDisable: false };
  }, [
    agentsMap,
    conversation?.agent_id,
    conversation?.assistant_id,
    conversation?.endpoint,
    conversation?.endpointType,
    conversation?.model,
    endpoint,
    invalidAgent,
    invalidAssistant,
    localize,
    modelsData,
    modelsError,
    modelsLoaded,
    providerLabel,
    requiresKey,
  ]);
  const serverModelStatusMessage = useMemo(
    () => modelAvailability?.[conversationId] ?? null,
    [modelAvailability, conversationId],
  );
  const modelStatusMessage = useMemo(
    () => serverModelStatusMessage ?? (!requiresKey ? readinessMessage : null),
    [serverModelStatusMessage, readinessMessage, requiresKey],
  );
  const disableUnavailable = shouldDisableForAvailability || !!serverModelStatusMessage;
  const disableInputs = useMemo(
    () => requiresKey || invalidAssistant || invalidAgent || disableUnavailable,
    [requiresKey, invalidAssistant, invalidAgent, disableUnavailable],
  );
  const shouldDimForm = disableInputs && !(isSubmitting || isSubmittingAdded);

  useEffect(() => {
    if (requiresKey && latestMessage?.error) {
      resetLatestMessage();
    }
  }, [requiresKey, latestMessage?.error, resetLatestMessage]);

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

  useAutoSave({
    files,
    setFiles,
    textAreaRef,
    conversationId,
    isSubmitting: isSubmitting || isSubmittingAdded,
  });

  const { submitMessage, submitPrompt } = useSubmitMessage();

  const handleKeyUp = useHandleKeyUp({
    index,
    textAreaRef,
    setShowPlusPopover,
    setShowMentionPopover,
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
        'md:py-3.5 m-0 w-full resize-none py-[13px] placeholder-black/50 bg-transparent dark:placeholder-white/50 [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]',
        isCollapsed ? 'max-h-[52px]' : 'max-h-[45vh] md:max-h-[55vh]',
        isMoreThanThreeRows ? 'pl-5' : 'px-5',
      ),
    [isCollapsed, isMoreThanThreeRows],
  );

  const activeEndpoint = useMemo(() => keyEndpoint ?? conversation?.endpoint ?? undefined, [
    keyEndpoint,
    conversation?.endpoint,
  ]);

  const endpointTypeForDialog = useMemo(
    () => getEndpointField(endpointsConfig, activeEndpoint, 'type') as string | undefined,
    [endpointsConfig, activeEndpoint],
  );

  const userProvideURL = useMemo(
    () => getEndpointField(endpointsConfig, activeEndpoint, 'userProvideURL'),
    [endpointsConfig, activeEndpoint],
  );

  const displayEndpointLabel = endpointLabel || activeEndpoint || localize('com_endpoint_ai');

  const warningMessage = useMemo(() => {
    if (isExpired && expiryTime && expiryTime !== 'never') {
      try {
        const formatted = new Date(expiryTime).toLocaleString();
        return localize('com_error_expired_user_key', { 0: displayEndpointLabel, 1: formatted });
      } catch {
        return localize('com_error_expired_user_key', { 0: displayEndpointLabel, 1: expiryTime });
      }
    }

    return localize('com_endpoint_config_placeholder');
  }, [displayEndpointLabel, expiryTime, isExpired, localize]);

  useEffect(() => {
    if (!requiresKey && keyDialogOpen) {
      setKeyDialogOpen(false);
    }
  }, [requiresKey, keyDialogOpen]);

  return (
    <>
      {requiresKey && activeEndpoint && (
        <>
          <div className="mb-3 rounded-xl border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-sm text-text-primary">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex w-full items-start gap-2 md:items-center">
                <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-medium">
                    {`${localize('com_endpoint_config_key_for')} ${displayEndpointLabel}`}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">{warningMessage}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ml-6 flex items-center gap-2 md:ml-0"
                onClick={() => setKeyDialogOpen(true)}
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                {localize('com_endpoint_config_key')}
              </Button>
            </div>
          </div>
          <SetKeyDialog
            open={keyDialogOpen}
            endpoint={activeEndpoint}
            endpointType={
              (endpointTypeForDialog as EModelEndpoint | undefined) ?? endpointType ?? undefined
            }
            userProvideURL={userProvideURL}
            onOpenChange={setKeyDialogOpen}
          />
        </>
      )}
      {modelStatusMessage && (
        <div className="mb-3 rounded-xl border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-text-primary">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500" aria-hidden="true" />
            <p className="text-sm leading-snug">{modelStatusMessage}</p>
          </div>
        </div>
      )}
      <form
        aria-disabled={disableInputs}
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
          shouldDimForm && 'pointer-events-none opacity-50',
        )}
      >
        <div className="relative flex h-full flex-1 items-stretch md:flex-col">
          <div className={cn('flex w-full items-center', isRTL && 'flex-row-reverse')}>
            {showPlusPopover && !isAssistantsEndpoint(endpoint) && (
              <Mention
                conversation={conversation}
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
                conversation={conversation}
                setShowMentionPopover={setShowMentionPopover}
                newConversation={newConversation}
                textAreaRef={textAreaRef}
              />
            )}
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
              <EditBadges
                isEditingChatBadges={isEditingBadges}
                handleCancelBadges={handleCancelBadges}
                handleSaveBadges={handleSaveBadges}
                setBadges={setBadges}
              />
              <FileFormChat conversation={conversation} />
              {endpoint && (
                <div className={cn('flex', isRTL ? 'flex-row-reverse' : 'flex-row')}>
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
                    onFocus={() => {
                      handleFocusOrClick();
                      setIsTextAreaFocused(true);
                    }}
                    onBlur={setIsTextAreaFocused.bind(null, false)}
                    aria-label={localize('com_ui_message_input')}
                    onClick={handleFocusOrClick}
                    style={{ height: 44, overflowY: 'auto' }}
                    className={cn(
                      baseClasses,
                      removeFocusRings,
                      'transition-[max-height] duration-200 disabled:cursor-not-allowed',
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
                  <AttachFileChat conversation={conversation} disableInputs={disableInputs} />
                </div>
                <BadgeRow
                  showEphemeralBadges={
                    !isAgentsEndpoint(endpoint) && !isAssistantsEndpoint(endpoint)
                  }
                  isSubmitting={isSubmitting || isSubmittingAdded}
                  conversationId={conversationId}
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
                  {(isSubmitting || isSubmittingAdded) && (showStopButton || showStopAdded) ? (
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
    </>
  );
});

export default ChatForm;
