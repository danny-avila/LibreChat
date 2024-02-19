import { useState, useEffect } from 'react';

export default function useProgress(initialProgress = 0.01) {
  const [progress, setProgress] = useState(initialProgress);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    let timer: ReturnType<typeof setInterval>;
    if (initialProgress >= 1 && progress >= 1) {
      return;
    } else if (initialProgress >= 1 && progress < 1) {
      setProgress(0.99);
      timeout = setTimeout(() => {
        setProgress(1);
      }, 200);
    } else {
      timer = setInterval(() => {
        setProgress((prevProgress) => {
          if (prevProgress >= 1) {
            clearInterval(timer);
            return 1;
          }
          return Math.min(prevProgress + 0.007, 0.95);
        });
      }, 200);
    }

    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [progress, initialProgress]);

  return progress;
}
