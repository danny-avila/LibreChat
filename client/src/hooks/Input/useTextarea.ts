import { useEffect, useRef, useCallback, useMemo } from 'react';
import debounce from 'lodash/debounce';
import { useToastContext } from '@librechat/client';
import { useRecoilValue, useRecoilState } from 'recoil';
import { EToolResources, isAssistantsEndpoint } from 'librechat-data-provider';
import type { TEndpointOption } from 'librechat-data-provider';
import type { KeyboardEvent } from 'react';
import {
  parseBinding,
  isMacPlatform,
  bindingFromEvent,
  resolveSubmitOverrideAction,
} from '~/utils/shortcuts';
import {
  forceResize,
  insertTextAtCursor,
  getEntityName,
  getEntity,
  checkIfScrollable,
} from '~/utils';
import { useAssistantsMapContext } from '~/Providers/AssistantsMapContext';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import useFileUploadRouter from '~/hooks/Files/useFileUploadRouter';
import { useAgentsMapContext } from '~/Providers/AgentsMapContext';
import useGetSender from '~/hooks/Conversations/useGetSender';
import useUploadOptions from '~/hooks/Files/useUploadOptions';
import { useInteractionHealthCheck } from '~/data-provider';
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
  onDuringRunModifier?: (kind: 'other' | 'interrupt') => void;
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
  const customShortcuts = useRecoilValue(store.customShortcuts);

  /**
   * Effective `submitMessage` override: `undefined` when unset (default Ctrl/Cmd+Enter applies),
   * `null` when explicitly unbound, otherwise the rebound chord. When present, the composer
   * honors it instead of the hard-coded Ctrl/Cmd+Enter so the shortcut can be replaced or
   * disabled in the main place it is used.
   */
  const submitOverride = useMemo(() => {
    const override = customShortcuts['submitMessage'];
    if (!override) {
      return undefined;
    }
    return parseBinding(isMacPlatform ? override.mac : override.other);
  }, [customShortcuts]);

  const { index, conversation, isSubmitting, filesLoading, setFilesLoading } = useChatContext();
  const latestMessage = useLatestMessage(index);
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

      const isNonShiftEnter = e.key === 'Enter' && !e.shiftKey;
      const isCtrlEnter = e.key === 'Enter' && (e.ctrlKey || e.metaKey);

      // NOTE: isComposing and e.key behave differently in Safari compared to other browsers, forcing us to use e.keyCode instead
      const isComposingInput = isComposing.current || e.key === 'Process' || e.keyCode === 229;

      if (
        e.key === 'Enter' &&
        isSubmitting &&
        allowSubmitWhileGenerating &&
        onDuringRunModifier != null &&
        !isComposingInput
      ) {
        if (e.altKey) {
          e.preventDefault();
          onDuringRunModifier('interrupt');
          return;
        }
        // Only when plain Enter is the submit key — for Ctrl/Cmd+Enter
        // submitters (enterToSend off or a rebound chord) the chord must
        // keep meaning "submit the default action".
        if ((e.ctrlKey || e.metaKey) && enterToSend && submitOverride === undefined) {
          e.preventDefault();
          onDuringRunModifier('other');
          return;
        }
      }

      const submitMessage = () => {
        const globalAudio = document.getElementById(globalAudioId) as HTMLAudioElement | undefined;
        if (globalAudio) {
          console.log('Unmuting global audio');
          globalAudio.muted = false;
        }
        submitButtonRef.current?.click();
      };

      // A rebound (or unbound) submitMessage shortcut takes over Enter handling in the composer
      // so the default Ctrl/Cmd+Enter no longer submits once the user has replaced or disabled it.
      if (submitOverride !== undefined) {
        if (isComposingInput) {
          return;
        }
        const action = resolveSubmitOverrideAction(
          bindingFromEvent(e.nativeEvent),
          submitOverride,
          enterToSend,
        );
        if (action === 'submit') {
          e.preventDefault();
          submitMessage();
          return;
        }
        if (action === 'newline' && textAreaRef.current) {
          e.preventDefault();
          insertTextAtCursor(textAreaRef.current, '\n');
          forceResize(textAreaRef.current);
        }
        return;
      }

      if (isNonShiftEnter && filesLoading) {
        e.preventDefault();
      }

      if (isNonShiftEnter) {
        e.preventDefault();
      }

      if (
        e.key === 'Enter' &&
        !enterToSend &&
        !isCtrlEnter &&
        textAreaRef.current &&
        !isComposingInput
      ) {
        e.preventDefault();
        insertTextAtCursor(textAreaRef.current, '\n');
        forceResize(textAreaRef.current);
        return;
      }

      if ((isNonShiftEnter || isCtrlEnter) && !isComposingInput) {
        submitMessage();
      }
    },
    [
      isSubmitting,
      allowSubmitWhileGenerating,
      onDuringRunModifier,
      checkHealth,
      filesLoading,
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
        setFilesLoading(true);
        const timestampedFiles: File[] = [];
        for (const file of clipboardData.files) {
          const newFile = new File([file], `clipboard_${+new Date()}_${file.name}`, {
            type: file.type,
          });
          timestampedFiles.push(newFile);
        }

        if (uploadsDisabled) {
          showToast({ message: localize('com_ui_attach_error_disabled'), status: 'error' });
          setFilesLoading(false);
          return;
        }

        /** Assistants use their own upload path; bypass option resolution like drag-and-drop does */
        if (isAssistantsEndpoint(conversation?.endpoint)) {
          routeFiles(timestampedFiles);
          return;
        }

        const options = getUploadOptions(timestampedFiles);
        if (options.length === 0) {
          showToast({ message: localize('com_error_files_unsupported'), status: 'error' });
          setFilesLoading(false);
          return;
        }
        if (options.length === 1) {
          routeFiles(timestampedFiles, options[0]);
          if (options[0] === EToolResources.context) {
            showToast({ message: localize('com_ui_file_attached_as_text'), status: 'info' });
          }
          return;
        }
        setFilesLoading(false);
        openModal(timestampedFiles);
      }
    },
    [
      localize,
      showToast,
      openModal,
      routeFiles,
      conversation,
      textAreaRef,
      uploadsDisabled,
      setFilesLoading,
      getUploadOptions,
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
