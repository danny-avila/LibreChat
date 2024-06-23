import { useCallback } from 'react';
import copy from 'copy-to-clipboard';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';

export default function useCopyToClipboard({
  text,
  content,
}: Partial<Pick<TMessage, 'text' | 'content'>>) {
  const copyToClipboard = useCallback(
    (setIsCopied: React.Dispatch<React.SetStateAction<boolean>>) => {
      setIsCopied(true);
      let messageText = text ?? '';
      if (content) {
        messageText = content.reduce((acc, curr, i) => {
          if (curr.type === ContentTypes.TEXT) {
            return acc + curr.text.value + (i === content.length - 1 ? '' : '\n');
          }
          return acc;
        }, '');
      }
      copy(messageText ?? '', { format: 'text/plain' });

      setTimeout(() => {
        setIsCopied(false);
      }, 3000);
    },
    [text, content],
  );

  return copyToClipboard;
}
