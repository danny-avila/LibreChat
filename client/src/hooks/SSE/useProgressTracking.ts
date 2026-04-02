import { useRef, useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { toolCallProgressMapAtom } from '~/store/progress';

export function useProgressTracking() {
  const setToolCallProgressMap = useSetAtom(toolCallProgressMapAtom);
  const progressCleanupTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const handleProgressEvent = useCallback(
    (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const { progress, total, message, toolCallId } = data;
        if (toolCallId != null) {
          setToolCallProgressMap((currentMap) => {
            const newMap = new Map(currentMap);
            newMap.set(toolCallId, { progress, total, message, timestamp: Date.now() });
            return newMap;
          });
          if (total && progress >= total) {
            const existingTimer = progressCleanupTimers.current.get(toolCallId);
            if (existingTimer) clearTimeout(existingTimer);
            const timerId = setTimeout(() => {
              setToolCallProgressMap((currentMap) => {
                const newMap = new Map(currentMap);
                newMap.delete(toolCallId);
                return newMap;
              });
              progressCleanupTimers.current.delete(toolCallId);
            }, 5000);
            progressCleanupTimers.current.set(toolCallId, timerId);
          }
        }
      } catch (error) {
        console.error('Error parsing progress event:', error);
      }
    },
    [setToolCallProgressMap],
  );

  const cleanupProgress = useCallback(() => {
    setToolCallProgressMap(new Map());
    progressCleanupTimers.current.forEach(clearTimeout);
    progressCleanupTimers.current.clear();
  }, [setToolCallProgressMap]);

  return { handleProgressEvent, cleanupProgress };
}
