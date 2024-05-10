import debounce from 'lodash/debounce';
import { useEffect, useRef, useCallback } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import type { TEndpointOption } from 'librechat-data-provider';
import type { KeyboardEvent } from 'react';
import { forceResize, insertTextAtCursor, getAssistantName } from '~/utils';
import { useAssistantsMapContext } from '~/Providers/AssistantsMapContext';
import useGetSender from '~/hooks/Conversations/useGetSender';
import useFileHandling from '~/hooks/Files/useFileHandling';
import { useChatContext } from '~/Providers/ChatContext';
import useLocalize from '~/hooks/useLocalize';
import store from '~/store';

type KeyEvent = KeyboardEvent<HTMLTextAreaElement>;

export default function useTextarea({
  textAreaRef,
  submitButtonRef,
  disabled = false,
}: {
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  submitButtonRef: React.RefObject<HTMLButtonElement>;
  disabled?: boolean;
}) {
  const localize = useLocalize();
  const getSender = useGetSender();
  const isComposing = useRef(false);
  const { handleFiles } = useFileHandling();
  const assistantMap = useAssistantsMapContext();
  const enterToSend = useRecoilValue(store.enterToSend);

  const {
    index,
    conversation,
    isSubmitting,
    filesLoading,
    latestMessage,
    setFilesLoading,
    setShowBingToneSetting,
  } = useChatContext();

  const setShowMentionPopover = useSetRecoilState(store.showMentionPopoverFamily(index));

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
      if (
        conversation?.endpoint === EModelEndpoint.assistants &&
        (!conversation?.assistant_id || !assistantMap?.[conversation?.assistant_id ?? ''])
      ) {
        return localize('com_endpoint_assistant_placeholder');
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
        forceResize(textAreaRef);
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
    assistantMap,
  ]);

  const handleKeyUp = useCallback(() => {
    const text = textAreaRef.current?.value;
    if (!(text && text[text.length - 1] === '@')) {
      return;
    }

    const startPos = textAreaRef.current?.selectionStart;
    if (!startPos) {
      return;
    }

    const isAtStart = startPos === 1;
    const isPrecededBySpace = textAreaRef.current?.value.charAt(startPos - 2) === ' ';

    setShowMentionPopover(isAtStart || isPrecededBySpace);
  }, [textAreaRef, setShowMentionPopover]);

  const handleKeyDown = useCallback(
    (e: KeyEvent) => {
      if (e.key === 'Enter' && isSubmitting) {
        return;
      }

      const isNonShiftEnter = e.key === 'Enter' && !e.shiftKey;

      if (isNonShiftEnter && filesLoading) {
        e.preventDefault();
      }

      if (isNonShiftEnter) {
        e.preventDefault();
      }

      if (e.key === 'Enter' && !enterToSend && textAreaRef.current) {
        insertTextAtCursor(textAreaRef.current, '\n');
        forceResize(textAreaRef);
        return;
      }

      if (isNonShiftEnter && !isComposing?.current) {
        submitButtonRef.current?.click();
      }
    },
    [isSubmitting, filesLoading, enterToSend, textAreaRef, submitButtonRef],
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

      if (!e.clipboardData) {
        return;
      }

      let richText = '';
      let includedText = '';
      const { types } = e.clipboardData;

      if (types.indexOf('text/rtf') !== -1 || types.indexOf('Files') !== -1) {
        e.preventDefault();
        includedText = e.clipboardData.getData('text/plain');
        richText = e.clipboardData.getData('text/rtf');
      }

      if (includedText && (e.clipboardData.files.length > 0 || richText)) {
        insertTextAtCursor(textAreaRef.current, includedText);
        forceResize(textAreaRef);
      }

      if (e.clipboardData.files.length > 0) {
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
    handlePaste,
    handleKeyUp,
    handleKeyDown,
    handleCompositionStart,
    handleCompositionEnd,
  };
}
