import { useEffect, useRef } from 'react';

const useDidMountEffect = (func, deps) => {
  const didMount = useRef(false);

  useEffect(() => {
    if (didMount.current) {
      func();
    } else {
      didMount.current = true;
    }

    return func;
  }, deps);
};

export default useDidMountEffect;
