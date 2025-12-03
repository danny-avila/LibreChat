// hooks/useAutoScroll.ts
import { useEffect, useState } from 'react';

interface UseAutoScrollProps {
  ref: React.RefObject<HTMLElement>;
  content: string;
  isSubmitting: boolean;
}

export const useAutoScroll = ({ ref, content, isSubmitting }: UseAutoScrollProps) => {
  const [userScrolled, setUserScrolled] = useState(false);

  useEffect(() => {
    const scrollContainer = ref.current;
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
  }, [ref]);

  useEffect(() => {
    const scrollContainer = ref.current;
    if (!scrollContainer || !isSubmitting || userScrolled) {
      return;
    }

    scrollContainer.scrollTop = scrollContainer.scrollHeight;
  }, [content, isSubmitting, userScrolled, ref]);

  return { userScrolled };
};
