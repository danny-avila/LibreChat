import { useCallback, useMemo } from 'react';
import type { SetterOrUpdater } from 'recoil';

/** Event Keys that shouldn't trigger a command */
const invalidKeys = {
  Escape: true,
  Backspace: true,
  Enter: true,
};

/**
 * Utility function to determine if a command should trigger.
 */
const shouldTriggerCommand = (
  textAreaRef: React.RefObject<HTMLTextAreaElement>,
  commandChar: string,
) => {
  const text = textAreaRef.current?.value;
  if (!(text && text[text.length - 1] === commandChar)) {
    return false;
  }

  const startPos = textAreaRef.current?.selectionStart;
  if (!startPos) {
    return false;
  }

  const isAtStart = startPos === 1;
  const isPrecededBySpace = textAreaRef.current?.value.charAt(startPos - 2) === ' ';

  const shouldTrigger = isAtStart || isPrecededBySpace;
  return shouldTrigger;
};

/**
 * Custom hook for handling key up events with command triggers.
 */
const useHandleKeyUp = ({
  textAreaRef,
  setShowPlusPopover,
  setShowMentionPopover,
}: {
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  setShowPlusPopover: SetterOrUpdater<boolean>;
  setShowMentionPopover: SetterOrUpdater<boolean>;
}) => {
  const handleAtCommand = useCallback(() => {
    if (shouldTriggerCommand(textAreaRef, '@')) {
      setShowMentionPopover(true);
    }
  }, [textAreaRef, setShowMentionPopover]);

  const handlePlusCommand = useCallback(() => {
    if (shouldTriggerCommand(textAreaRef, '+')) {
      setShowPlusPopover(true);
    }
  }, [textAreaRef, setShowPlusPopover]);

  const commandHandlers = useMemo(
    () => ({
      '@': handleAtCommand,
      '+': handlePlusCommand,
    }),
    [handleAtCommand, handlePlusCommand],
  );

  /**
   * Main key up handler.
   */
  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const text = textAreaRef.current?.value;
      if (!text) {
        return;
      }

      if (invalidKeys[event.key]) {
        return;
      }

      const lastChar = text[text.length - 1];
      const handler = commandHandlers[lastChar];

      if (handler) {
        handler();
      }
    },
    [textAreaRef, commandHandlers],
  );

  return handleKeyUp;
};

export default useHandleKeyUp;
