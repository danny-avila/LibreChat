import { useCallback } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { globalAudioId } from '~/common';
import store from '~/store';

function usePauseGlobalAudio(index = 0) {
  /* Global Audio Variables */
  const setAudioRunId = useSetRecoilState(store.audioRunFamily(index));
  const setIsGlobalAudioFetching = useSetRecoilState(store.globalAudioFetchingFamily(index));
  const [globalAudioURL, setGlobalAudioURL] = useRecoilState(store.globalAudioURLFamily(index));
  const setGlobalIsPlaying = useSetRecoilState(store.globalAudioPlayingFamily(index));

  const pauseGlobalAudio = useCallback(() => {
    if (globalAudioURL) {
      const globalAudio = document.getElementById(globalAudioId);
      if (globalAudio) {
        console.log('Pausing global audio', globalAudioURL);
        (globalAudio as HTMLAudioElement).pause();
        setGlobalIsPlaying(false);
      }
      URL.revokeObjectURL(globalAudioURL);
      setIsGlobalAudioFetching(false);
      setGlobalAudioURL(null);
      setAudioRunId(null);
    }
  }, [
    globalAudioURL,
    setGlobalAudioURL,
    setGlobalIsPlaying,
    setIsGlobalAudioFetching,
    setAudioRunId,
  ]);

  return { pauseGlobalAudio };
}

export default usePauseGlobalAudio;
