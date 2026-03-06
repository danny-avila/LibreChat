import { useCallback, useEffect, useState } from 'react';
import type { CodeEditorRef } from '@codesandbox/sandpack-react';

interface UseAutoScrollProps {
  ref: React.RefObject<HTMLElement>;
  editorRef?: React.RefObject<CodeEditorRef>;
  content: string;
  isSubmitting: boolean;
}

export const useAutoScroll = ({ ref, editorRef, content, isSubmitting }: UseAutoScrollProps) => {
  const [userScrolled, setUserScrolled] = useState(false);

  const getScrollContainer = useCallback(() => {
    return editorRef?.current?.getCodemirror()?.scrollDOM ?? ref.current;
  }, [editorRef, ref]);

  useEffect(() => {
    const scrollContainer = getScrollContainer();
    if (!scrollContainer) {
      return;
    }

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;

      if (!isNearBottom) {
        setUserScrolled(true);
      } else {
        setUserScrolled(false);
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [getScrollContainer]);

  useEffect(() => {
    const scrollContainer = getScrollContainer();
    if (!scrollContainer || !isSubmitting || userScrolled) {
      return;
    }

    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }, [content, isSubmitting, userScrolled, getScrollContainer]);

  return { userScrolled };
};
