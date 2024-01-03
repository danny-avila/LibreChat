import debounce from 'lodash/debounce';
import { useEffect, useRef } from 'react';
import { TEndpointOption } from 'librechat-data-provider';
import type { KeyboardEvent } from 'react';
import useGetSender from '~/hooks/Conversations/useGetSender';
import { useChatContext } from '~/Providers/ChatContext';
import useFileHandling from '~/hooks/useFileHandling';
import useLocalize from '~/hooks/useLocalize';

type KeyEvent = KeyboardEvent<HTMLTextAreaElement>;

export default function useTextarea({ setText, submitMessage, disabled = false }) {
  const { conversation, isSubmitting, latestMessage, setShowBingToneSetting, setFilesLoading } =
    useChatContext();
  const isComposing = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const { handleFiles } = useFileHandling();
  const getSender = useGetSender();
  const localize = useLocalize();

  const { conversationId, jailbreak } = conversation || {};
  const isNotAppendable = (latestMessage?.unfinished && !isSubmitting) || latestMessage?.error;
  // && (conversationId?.length ?? 0) > 6; // also ensures that we don't show the wrong placeholder

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
      inputRef.current?.focus();
    }
    // setShowBingToneSetting is a recoil setter, so it doesn't need to be in the dependency array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, jailbreak]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [isSubmitting]);

  useEffect(() => {
    if (inputRef.current?.value) {
      return;
    }

    const getPlaceholderText = () => {
      if (disabled) {
        return localize('com_endpoint_config_placeholder');
      }
      if (isNotAppendable) {
        return localize('com_endpoint_message_not_appendable');
      }

      const sender = getSender(conversation as TEndpointOption);

      return `${localize('com_endpoint_message')} ${sender ? sender : 'ChatGPT'}…`;
    };

    const placeholder = getPlaceholderText();

    if (inputRef.current?.getAttribute('placeholder') === placeholder) {
      return;
    }

    const setPlaceholder = () => {
      const placeholder = getPlaceholderText();

      if (inputRef.current?.getAttribute('placeholder') !== placeholder) {
        inputRef.current?.setAttribute('placeholder', placeholder);
      }
    };

    const debouncedSetPlaceholder = debounce(setPlaceholder, 80);
    debouncedSetPlaceholder();

    return () => debouncedSetPlaceholder.cancel();
  }, [conversation, disabled, latestMessage, isNotAppendable, localize, getSender]);

  const handleKeyDown = (e: KeyEvent) => {
    if (e.key === 'Enter' && isSubmitting) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
    }

    if (e.key === 'Enter' && !e.shiftKey && !isComposing?.current) {
      submitMessage();
    }
  };

  const handleKeyUp = (e: KeyEvent) => {
    const target = e.target as HTMLTextAreaElement;

    if (e.keyCode === 8 && target.value.trim() === '') {
      setText(target.value);
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

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData && e.clipboardData.files.length > 0) {
      e.preventDefault();
      setFilesLoading(true);
      handleFiles(e.clipboardData.files);
    }
  };

  return {
    inputRef,
    handleKeyDown,
    handleKeyUp,
    handlePaste,
    handleCompositionStart,
    handleCompositionEnd,
  };
}
