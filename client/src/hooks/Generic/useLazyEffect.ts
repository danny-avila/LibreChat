/* eslint-disable react-hooks/exhaustive-deps */
// https://stackoverflow.com/a/67504622/51500
import { DependencyList, EffectCallback, useCallback, useEffect, useRef } from 'react';
import debounce from 'lodash/debounce';

export function useLazyEffect(effect: EffectCallback, deps: DependencyList = [], wait = 300) {
  const cleanUp = useRef<void | (() => void)>();
  const effectRef = useRef<EffectCallback>();
  effectRef.current = useCallback(effect, deps);
  const lazyEffect = useCallback(
    debounce(() => (cleanUp.current = effectRef.current?.()), wait),
    [],
  );
  useEffect(lazyEffect, deps);
  useEffect(() => {
    return () => (cleanUp.current instanceof Function ? cleanUp.current() : undefined);
  }, []);
}
