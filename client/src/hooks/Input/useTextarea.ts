import debounce from 'lodash/debounce';
import React, { useEffect, useRef, useCallback } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TEndpointOption } from 'librechat-data-provider';
import type { KeyboardEvent } from 'react';
import { useAssistantsMapContext } from '~/Providers/AssistantsMapContext';
import useGetSender from '~/hooks/Conversations/useGetSender';
import useFileHandling from '~/hooks/Files/useFileHandling';
import { useChatContext } from '~/Providers/ChatContext';
import useLocalize from '~/hooks/useLocalize';

type KeyEvent = KeyboardEvent<HTMLTextAreaElement>;

function insertTextAtCursor(element: HTMLTextAreaElement, textToInsert: string) {
  // Focus the element to ensure the insertion point is updated
  element.focus();

  // Use the browser's built-in undoable actions if possible
  if (window.getSelection() && document.queryCommandSupported('insertText')) {
    document.execCommand('insertText', false, textToInsert);
  } else {
    console.warn('insertTextAtCursor: document.execCommand is not supported');
    const startPos = element.selectionStart;
    const endPos = element.selectionEnd;
    const beforeText = element.value.substring(0, startPos);
    const afterText = element.value.substring(endPos);
    element.value = beforeText + textToInsert + afterText;
    element.selectionStart = element.selectionEnd = startPos + textToInsert.length;
    const event = new Event('input', { bubbles: true });
    element.dispatchEvent(event);
  }
}

const getAssistantName = ({
  name,
  localize,
}: {
  name?: string;
  localize: (phraseKey: string, ...values: string[]) => string;
}) => {
  if (name && name.length > 0) {
    return name;
  } else {
    return localize('com_ui_assistant');
  }
};

export default function useTextarea({
  textAreaRef,
  submitButtonRef,
  disabled = false,
}: {
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  submitButtonRef: React.RefObject<HTMLButtonElement>;
  disabled?: boolean;
}) {
  const assistantMap = useAssistantsMapContext();
  const { conversation, isSubmitting, latestMessage, setShowBingToneSetting, setFilesLoading } =
    useChatContext();
  const isComposing = useRef(false);
  const { handleFiles } = useFileHandling();
  const getSender = useGetSender();
  const localize = useLocalize();

  const { conversationId, jailbreak, endpoint = '', assistant_id } = conversation || {};
  const isNotAppendable =
    ((latestMessage?.unfinished && !isSubmitting) || latestMessage?.error) &&
    endpoint !== EModelEndpoint.assistants;
  // && (conversationId?.length ?? 0) > 6; // also ensures that we don't show the wrong placeholder

  const assistant = endpoint === EModelEndpoint.assistants && assistantMap?.[assistant_id ?? ''];
  const assistantName = (assistant && assistant?.name) || '';

  // auto focus to input, when enter a conversation.
  useEffect(() => {
    if (!conversationId) {
      return;
    }

    // Prevents Settings from not showing on new conversation, also prevents showing toneStyle change without jailbreak
    if (conversationId === 'new' || !jailbreak) {
      setShowBingToneSetting(false);
    }

    if (conversationId !== 'search') {
      textAreaRef.current?.focus();
    }
    // setShowBingToneSetting is a recoil setter, so it doesn't need to be in the dependency array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, jailbreak]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      textAreaRef.current?.focus();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [isSubmitting, textAreaRef]);

  useEffect(() => {
    if (textAreaRef.current?.value) {
      return;
    }

    const getPlaceholderText = () => {
      if (disabled) {
        return localize('com_endpoint_config_placeholder');
      }
      if (isNotAppendable) {
        return localize('com_endpoint_message_not_appendable');
      }

      const sender =
        conversation?.endpoint === EModelEndpoint.assistants
          ? getAssistantName({ name: assistantName, localize })
          : getSender(conversation as TEndpointOption);

      return `${localize('com_endpoint_message')} ${sender ? sender : 'ChatGPT'}…`;
    };

    const placeholder = getPlaceholderText();

    if (textAreaRef.current?.getAttribute('placeholder') === placeholder) {
      return;
    }

    const setPlaceholder = () => {
      const placeholder = getPlaceholderText();

      if (textAreaRef.current?.getAttribute('placeholder') !== placeholder) {
        textAreaRef.current?.setAttribute('placeholder', placeholder);
      }
    };

    const debouncedSetPlaceholder = debounce(setPlaceholder, 80);
    debouncedSetPlaceholder();

    return () => debouncedSetPlaceholder.cancel();
  }, [
    conversation,
    disabled,
    latestMessage,
    isNotAppendable,
    localize,
    getSender,
    assistantName,
    textAreaRef,
  ]);

  const handleKeyDown = (e: KeyEvent) => {
    if (e.key === 'Enter' && isSubmitting) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
    }

    if (e.key === 'Enter' && !e.shiftKey && !isComposing?.current) {
      submitButtonRef.current?.click();
    }
  };

  const handleKeyUp = (e: KeyEvent) => {
    const target = e.target as HTMLTextAreaElement;

    if (e.keyCode === 8 && target.value.trim() === '') {
      textAreaRef.current?.setRangeText('', 0, textAreaRef.current?.value?.length, 'end');
    }

    if (e.key === 'Enter' && e.shiftKey) {
      return console.log('Enter + Shift');
    }

    if (isSubmitting) {
      return;
    }
  };

  const handleCompositionStart = () => {
    isComposing.current = true;
  };

  const handleCompositionEnd = () => {
    isComposing.current = false;
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      e.preventDefault();
      const textArea = textAreaRef.current;
      if (!textArea) {
        return;
      }

      const pastedData = e.clipboardData.getData('text/plain');
      insertTextAtCursor(textArea, pastedData);

      if (e.clipboardData && e.clipboardData.files.length > 0) {
        e.preventDefault();
        setFilesLoading(true);
        const timestampedFiles: File[] = [];
        for (const file of e.clipboardData.files) {
          const newFile = new File([file], `clipboard_${+new Date()}_${file.name}`, {
            type: file.type,
          });
          timestampedFiles.push(newFile);
        }
        handleFiles(timestampedFiles);
      }
    },
    [handleFiles, setFilesLoading, textAreaRef],
  );

  return {
    textAreaRef,
    handleKeyDown,
    handleKeyUp,
    handlePaste,
    handleCompositionStart,
    handleCompositionEnd,
  };
}
