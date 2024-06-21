import { useCallback, useMemo } from 'react';
import { useSetRecoilState } from 'recoil';
import store from '~/store';

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
  if (shouldTrigger) {
    // Blurring helps prevent the command from firing twice.
    textAreaRef.current.blur();
  }
  return shouldTrigger;
};

/**
 * Custom hook for handling key up events with command triggers.
 */
const useHandleKeyUp = ({
  index,
  textAreaRef,
}: {
  index: number;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
}) => {
  const setShowMentionPopover = useSetRecoilState(store.showMentionPopoverFamily(index));

  const handleAtCommand = useCallback(() => {
    if (shouldTriggerCommand(textAreaRef, '@')) {
      setShowMentionPopover(true);
    }
  }, [textAreaRef, setShowMentionPopover]);

  // const handlePlusCommand = useCallback(() => {
  //   if (shouldTriggerCommand(textAreaRef, '+')) {
  //     console.log('+ command triggered');
  //   }
  // }, [textAreaRef]);

  const commandHandlers = useMemo(
    () => ({
      '@': handleAtCommand,
      // '+': handlePlusCommand,
    }),
    [handleAtCommand],
    // [handleAtCommand, handlePlusCommand],
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

      if (event.key === 'Escape') {
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
