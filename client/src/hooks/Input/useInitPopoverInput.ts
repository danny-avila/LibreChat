import { useCallback } from 'react';

/** Creates a callback ref that focuses the popover input, transfers the command text as a search prefix, and clears the textarea. */
const useInitPopoverInput = ({
  inputRef,
  textAreaRef,
  commandChar,
  setSearchValue,
  setOpen,
}: {
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  textAreaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  commandChar: string;
  setSearchValue: (value: string) => void;
  setOpen: (value: boolean) => void;
}) =>
  useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (!node) {
        return;
      }
      node.focus();
      setOpen(true);
      const textarea = textAreaRef.current;
      if (!textarea) {
        return;
      }
      const text = textarea.value;
      if (text.length > 0 && text[0] === commandChar) {
        if (text.length > 1) {
          setSearchValue(text.slice(1));
        }
        textarea.value = '';
        textarea.setSelectionRange(0, 0);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    [inputRef, textAreaRef, commandChar, setSearchValue, setOpen],
  );

export default useInitPopoverInput;
