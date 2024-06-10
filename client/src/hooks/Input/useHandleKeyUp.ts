import { useCallback, useMemo } from 'react';
import { useSetRecoilState } from 'recoil';
import store from '~/store';

const useHandleKeyUp = ({
  index,
  textAreaRef,
}: {
  index: number;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
}) => {
  const setShowMentionPopover = useSetRecoilState(store.showMentionPopoverFamily(index));

  const handleAtCommand = useCallback(() => {
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

  const commandHandlers = useMemo(
    () => ({
      '@': handleAtCommand,
    }),
    [handleAtCommand],
  );

  const handleKeyUp = useCallback(() => {
    const text = textAreaRef.current?.value;
    if (!text) {
      return;
    }

    const lastChar = text[text.length - 1];
    const handler = commandHandlers[lastChar];

    if (handler) {
      handler();
    }
  }, [textAreaRef, commandHandlers]);

  return handleKeyUp;
};

export default useHandleKeyUp;
