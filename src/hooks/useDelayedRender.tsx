import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';

const useDelayedRender = (delay: number) => {
  const [delayed, setDelayed] = useState(true);
  useEffect(() => {
    const timeout = setTimeout(() => setDelayed(false), delay);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (fn: () => ReactNode) => !delayed && fn();
};

export default useDelayedRender;
