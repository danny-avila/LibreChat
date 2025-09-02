import { useCallback } from 'react';

interface UseScrollNavigationProps {
  containerRef: React.RefObject<HTMLElement>;
  onSectionChange: (sectionId: string) => void;
  isProgrammaticScroll: React.MutableRefObject<boolean>;
}

export const useScrollNavigation = ({
  containerRef,
  onSectionChange,
  isProgrammaticScroll,
}: UseScrollNavigationProps) => {
  const scrollToSection = useCallback(
    (sectionId: string) => {
      const container = containerRef.current;
      const section = document.getElementById(sectionId);

      if (!container || !section) return;

      onSectionChange(sectionId);

      isProgrammaticScroll.current = true;

      const containerRect = container.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      const targetScrollTop = container.scrollTop + (sectionRect.top - containerRect.top) - 20;

      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });

      setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 800);
    },
    [containerRef, onSectionChange, isProgrammaticScroll]
  );

  return { scrollToSection };
}; 