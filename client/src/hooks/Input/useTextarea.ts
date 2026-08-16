import { useEffect, useRef, useCallback } from 'react';
import debounce from 'lodash/debounce';
import { useToastContext } from '@librechat/client';
import { useRecoilValue, useRecoilState } from 'recoil';
import { EToolResources, isAssistantsEndpoint } from 'librechat-data-provider';
import type { TEndpointOption } from 'librechat-data-provider';
import type { KeyboardEvent } from 'react';
import {
  forceResize,
  insertTextAtCursor,
  resolvePastedTextFile,
  getEntityName,
  getEntity,
  checkIfScrollable,
} from '~/utils';
import { useAssistantsMapContext } from '~/Providers/AssistantsMapContext';
import { useLatestMessageMeta } from '~/hooks/Messages/useLatestMessage';
import useComposerBindings from '~/hooks/Input/useComposerBindings';
import useFileUploadRouter from '~/hooks/Files/useFileUploadRouter';
import { useAgentsMapContext } from '~/Providers/AgentsMapContext';
import useGetSender from '~/hooks/Conversations/useGetSender';
import useUploadOptions from '~/hooks/Files/useUploadOptions';
import { useInteractionHealthCheck } from '~/data-provider';
import { resolveComposerKeyDown } from '~/utils/shortcuts';
import { useChatContext } from '~/Providers/ChatContext';
import { useUploadModalContext } from '~/Providers';
import { globalAudioId } from '~/common';
import { useLocalize } from '~/hooks';
import store from '~/store';

type KeyEvent = KeyboardEvent<HTMLTextAreaElement>;

export default function useTextarea({
  textAreaRef,
  submitButtonRef,
  setIsScrollable,
  disabled = false,
  placeholder,
  allowSubmitWhileGenerating = false,
  onDuringRunModifier,
}: {
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  submitButtonRef: React.RefObject<HTMLButtonElement>;
  setIsScrollable: React.Dispatch<React.SetStateAction<boolean>>;
  disabled?: boolean;
  placeholder?: string;
  /** Lets Enter submit during a run (during-run steering/queuing routes it). */
  allowSubmitWhileGenerating?: boolean;
  /** During-run modifier chords: ⌘/Ctrl+Enter = the non-default action,
   *  ⌥/Alt+Enter = interrupt & send. Enter itself submits the default. */
  onDuringRunModifier?: (kind: 'other' | 'interrupt' | 'preempt') => void;
}) {
  const localize = useLocalize();
  const getSender = useGetSender();
  const isComposing = useRef(false);
  const agentsMap = useAgentsMapContext();
  const { showToast } = useToastContext();
  const { getOptions: getUploadOptions, uploadsDisabled } = useUploadOptions();
  const routeFiles = useFileUploadRouter();
  const { openModal } = useUploadModalContext();
  const assistantMap = useAssistantsMapContext();
  const checkHealth = useInteractionHealthCheck();
  const enterToSend = useRecoilValue(store.enterToSend);
  const pasteLongTextAsFile = useRecoilValue(store.pasteLongTextAsFile);
  const { shortcutsEnabled, submitOverride, yieldedChords } = useComposerBindings();

  const { index, conversation, isSubmitting, files, setFilesLoading } = useChatContext();
  const latestMessage = useLatestMessageMeta(index);
  const [activePrompt, setActivePrompt] = useRecoilState(store.activePromptByIndex(index));

  const { endpoint = '' } = conversation || {};
  const { entity, isAgent, isAssistant } = getEntity({
    endpoint,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });
  const entityName = entity?.name ?? '';

  const isNotAppendable =
    latestMessage?.error === true && latestMessage.isCreatedByUser === true && !isAssistant;
  // && (conversationId?.length ?? 0) > 6; // also ensures that we don't show the wrong placeholder

  useEffect(() => {
    const prompt = activePrompt ?? '';
    if (prompt && textAreaRef.current) {
      insertTextAtCursor(textAreaRef.current, prompt);
      forceResize(textAreaRef.current);
      setActivePrompt(undefined);
    }
  }, [activePrompt, setActivePrompt, textAreaRef]);

  useEffect(() => {
    const currentValue = textAreaRef.current?.value ?? '';
    if (currentValue) {
      return;
    }

    const getPlaceholderText = () => {
      if (disabled) {
        return localize('com_endpoint_config_placeholder');
      }
      const currentEndpoint = conversation?.endpoint ?? '';
      const currentAgentId = conversation?.agent_id ?? '';
      const currentAssistantId = conversation?.assistant_id ?? '';
      if (isAgent && (!currentAgentId || !agentsMap?.[currentAgentId])) {
        return localize('com_endpoint_agent_placeholder');
      } else if (
        isAssistant &&
        (!currentAssistantId || !assistantMap?.[currentEndpoint]?.[currentAssistantId])
      ) {
        return localize('com_endpoint_assistant_placeholder');
      }

      if (isNotAppendable) {
        return localize('com_endpoint_message_not_appendable');
      }

      if (placeholder) {
        return placeholder;
      }

      const sender =
        isAssistant || isAgent
          ? getEntityName({ name: entityName, isAgent, localize })
          : getSender(conversation as TEndpointOption);

      return `${localize('com_endpoint_message_new', {
        0: sender ? sender : localize('com_endpoint_ai'),
      })}`;
    };

    const placeholderText = getPlaceholderText();

    if (textAreaRef.current?.getAttribute('placeholder') === placeholderText) {
      return;
    }

    const setPlaceholder = () => {
      const placeholderText = getPlaceholderText();

      if (textAreaRef.current?.getAttribute('placeholder') !== placeholderText) {
        textAreaRef.current?.setAttribute('placeholder', placeholderText);
        forceResize(textAreaRef.current);
      }
    };

    const debouncedSetPlaceholder = debounce(setPlaceholder, 80);
    debouncedSetPlaceholder();

    return () => debouncedSetPlaceholder.cancel();
  }, [
    isAgent,
    localize,
    disabled,
    getSender,
    agentsMap,
    entityName,
    textAreaRef,
    isAssistant,
    assistantMap,
    conversation,
    latestMessage,
    isNotAppendable,
    placeholder,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyEvent) => {
      if (textAreaRef.current && checkIfScrollable(textAreaRef.current)) {
        const scrollable = checkIfScrollable(textAreaRef.current);
        scrollable && setIsScrollable(scrollable);
      }
      if (e.key === 'Enter' && isSubmitting && !allowSubmitWhileGenerating) {
        return;
      }

      checkHealth();

      // NOTE: isComposing and e.key behave differently in Safari compared to other browsers, forcing us to use e.keyCode instead
      const isComposingInput = isComposing.current || e.key === 'Process' || e.keyCode === 229;

      const action = resolveComposerKeyDown(e.nativeEvent, {
        isComposing: isComposingInput,
        isSubmitting,
        allowSubmitWhileGenerating,
        hasDuringRunModifier: onDuringRunModifier != null,
        shortcutsEnabled,
        enterToSend,
        submitOverride,
        yieldedChords,
      });

      if (action === 'none') {
        return;
      }
      e.preventDefault();
      if (action === 'interrupt' || action === 'preempt' || action === 'other') {
        onDuringRunModifier?.(action);
        return;
      }
      if (action === 'newline' && textAreaRef.current) {
        insertTextAtCursor(textAreaRef.current, '\n');
        forceResize(textAreaRef.current);
        return;
      }
      if (action !== 'submit') {
        return;
      }
      const globalAudio = document.getElementById(globalAudioId) as HTMLAudioElement | undefined;
      if (globalAudio) {
        console.log('Unmuting global audio');
        globalAudio.muted = false;
      }
      submitButtonRef.current?.click();
    },
    [
      isSubmitting,
      allowSubmitWhileGenerating,
      onDuringRunModifier,
      shortcutsEnabled,
      yieldedChords,
      checkHealth,
      enterToSend,
      submitOverride,
      setIsScrollable,
      textAreaRef,
      submitButtonRef,
    ],
  );

  const handleCompositionStart = () => {
    isComposing.current = true;
  };

  const handleCompositionEnd = () => {
    isComposing.current = false;
  };

  /**
   * Sends clipboard-derived files to their upload destination, prompting when several are
   * viable. `preferred` skips that prompt when the caller already knows the intent.
   */
  const routeClipboardFiles = useCallback(
    (clipboardFiles: File[], preferred?: EToolResources) => {
      setFilesLoading(true);

      /** Assistants use their own upload path; bypass option resolution like drag-and-drop does */
      if (isAssistantsEndpoint(conversation?.endpoint)) {
        routeFiles(clipboardFiles);
        return;
      }

      const options = getUploadOptions(clipboardFiles);
      if (options.length === 0) {
        showToast({ message: localize('com_error_files_unsupported'), status: 'error' });
        setFilesLoading(false);
        return;
      }

      const usePreferred = preferred != null && options.includes(preferred);
      if (!usePreferred && options.length > 1) {
        setFilesLoading(false);
        openModal(clipboardFiles);
        return;
      }

      const destination = usePreferred ? preferred : options[0];
      /** Held until the upload is accepted so a rejected file (a duplicate, an oversized one)
       * reports only its own error instead of pairing it with a success message. */
      void routeFiles(clipboardFiles, destination).then((accepted) => {
        if (accepted && destination === EToolResources.context) {
          showToast({ message: localize('com_ui_file_attached_as_text'), status: 'info' });
        }
      });
    },
    [localize, showToast, openModal, routeFiles, conversation, setFilesLoading, getUploadOptions],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const textArea = textAreaRef.current;
      if (!textArea) {
        return;
      }

      const clipboardData = e.clipboardData as DataTransfer | undefined;
      if (!clipboardData) {
        return;
      }

      if (clipboardData.files.length > 0) {
        const timestampedFiles: File[] = [];
        for (const file of clipboardData.files) {
          const newFile = new File([file], `clipboard_${+new Date()}_${file.name}`, {
            type: file.type,
          });
          timestampedFiles.push(newFile);
        }

        if (uploadsDisabled) {
          showToast({ message: localize('com_ui_attach_error_disabled'), status: 'error' });
          return;
        }

        routeClipboardFiles(timestampedFiles);
        return;
      }

      const attachment = resolvePastedTextFile(clipboardData.getData('text/plain'), {
        enabled: pasteLongTextAsFile,
        uploadsDisabled,
        isAssistants: isAssistantsEndpoint(conversation?.endpoint),
        attachedFilenames: new Set(
          Array.from(files.values(), (attached) => attached.file?.name ?? attached.filename ?? ''),
        ),
        getOptions: getUploadOptions,
      });
      if (!attachment) {
        return;
      }

      e.preventDefault();
      routeClipboardFiles([attachment.file], attachment.toolResource);
    },
    [
      files,
      localize,
      showToast,
      conversation,
      textAreaRef,
      uploadsDisabled,
      getUploadOptions,
      pasteLongTextAsFile,
      routeClipboardFiles,
    ],
  );

  return {
    textAreaRef,
    handlePaste,
    handleKeyDown,
    isNotAppendable,
    handleCompositionEnd,
    handleCompositionStart,
  };
}
