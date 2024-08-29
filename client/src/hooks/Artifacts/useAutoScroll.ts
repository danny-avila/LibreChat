import { useState, useRef, useCallback, useEffect } from 'react';
import { useChatContext } from '~/Providers';

export default function useAutoScroll() {
  const { isSubmitting } = useChatContext();
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollableRef = useRef<HTMLDivElement | null>(null);
  const contentEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollableRef.current) {
      scrollableRef.current.scrollTop = scrollableRef.current.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollableRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollableRef.current;
      setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
    }
  }, []);

  useEffect(() => {
    if (isSubmitting) {
      scrollToBottom();
    }
  }, [isSubmitting, scrollToBottom]);

  return { scrollableRef, contentEndRef, handleScroll, scrollToBottom, showScrollButton };
}
