import { RefObject, useCallback } from 'react';
import throttle from 'lodash/throttle';

type TUseScrollToRef = {
  targetRef: RefObject<HTMLDivElement>;
  callback: () => void;
  smoothCallback: () => void;
};

export default function useScrollToRef({ targetRef, callback, smoothCallback }: TUseScrollToRef) {
  const logAndScroll = (behavior: 'instant' | 'smooth', callbackFn: () => void) => {
    // Debugging:
    targetRef.current?.scrollIntoView({ behavior });
    callbackFn();
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scrollToRef = useCallback(
    throttle(() => logAndScroll('instant', callback), 250, { leading: true }),
    [targetRef],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scrollToRefSmooth = useCallback(
    throttle(() => logAndScroll('smooth', smoothCallback), 750, { leading: true }),
    [targetRef],
  );

  const handleSmoothToRef: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    scrollToRefSmooth();
  };

  return {
    scrollToRef,
    handleSmoothToRef,
  };
}

type TUseScrollToID = {
  id: string;
  callback?: () => void;
};

export function useScrollToID({ id, callback }: TUseScrollToID) {
  const logAndScroll = (behavior: 'instant' | 'smooth', callbackFn?: () => void) => {
    // Debugging:
    const targetElement = document.getElementById(id);
    targetElement?.scrollIntoView({ behavior });
    callbackFn && callbackFn();
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scrollToId = useCallback(
    throttle(() => logAndScroll('instant', callback), 250, { leading: true }),
    [],
  );

  return {
    scrollToId,
  };
}
