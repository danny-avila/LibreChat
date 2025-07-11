import { useCallback } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { globalAudioId } from '~/common';
import store from '~/store';

function usePauseGlobalAudio(index = 0) {
  /* Global Audio Variables */
  const setAudioRunId = useSetAtom(store.audioRunFamily(index));
  const setActiveRunId = useSetAtom(store.activeRunFamily(index));
  const setGlobalIsPlaying = useSetAtom(store.globalAudioPlayingFamily(index));
  const setIsGlobalAudioFetching = useSetAtom(store.globalAudioFetchingFamily(index));
  const [globalAudioURL, setGlobalAudioURL] = useAtom(store.globalAudioURLFamily(index));

  const pauseGlobalAudio = useCallback(() => {
    if (globalAudioURL != null && globalAudioURL !== '') {
      const globalAudio = document.getElementById(globalAudioId);
      if (globalAudio) {
        console.log('Pausing global audio', globalAudioURL);
        (globalAudio as HTMLAudioElement).pause();
        setGlobalIsPlaying(false);
      }
      URL.revokeObjectURL(globalAudioURL);
      setIsGlobalAudioFetching(false);
      setGlobalAudioURL(null);
      setActiveRunId(null);
      setAudioRunId(null);
    }
  }, [
    setAudioRunId,
    setActiveRunId,
    globalAudioURL,
    setGlobalAudioURL,
    setGlobalIsPlaying,
    setIsGlobalAudioFetching,
  ]);

  return { pauseGlobalAudio };
}

export default usePauseGlobalAudio;
