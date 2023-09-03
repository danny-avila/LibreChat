import { RefObject, useCallback } from 'react';
import throttle from 'lodash/throttle';

export default function useScrollToRef(targetRef: RefObject<HTMLDivElement>, callback: () => void) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scrollToRef = useCallback(
    throttle(
      () => {
        targetRef.current?.scrollIntoView({ behavior: 'instant' });
        callback();
      },
      450,
      { leading: true },
    ),
    [targetRef],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scrollToRefSmooth = useCallback(
    throttle(
      () => {
        targetRef.current?.scrollIntoView({ behavior: 'smooth' });
        callback();
      },
      750,
      { leading: true },
    ),
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
