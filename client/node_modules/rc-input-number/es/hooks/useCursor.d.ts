/**
 * Keep input cursor in the correct position if possible.
 * Is this necessary since we have `formatter` which may mass the content?
 */
export default function useCursor(input: HTMLInputElement, focused: boolean): [() => void, () => void];
