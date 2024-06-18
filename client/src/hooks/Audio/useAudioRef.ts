import { useEffect, useRef } from 'react';

export default function useCustomAudioRef({
  setIsPlaying,
}: {
  setIsPlaying: (isPlaying: boolean) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const handleEnded = () => {
      setIsPlaying(false);
      if (audioRef.current) {
        URL.revokeObjectURL(audioRef.current.src);
      }
    };

    const handleStart = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const audioElement = audioRef.current;

    if (audioRef.current) {
      audioRef.current.muted = true;
      audioRef.current.addEventListener('ended', handleEnded);
      audioRef.current.addEventListener('play', handleStart);
      audioRef.current.addEventListener('pause', handlePause);
    }

    return () => {
      if (audioElement) {
        audioElement.removeEventListener('ended', handleEnded);
        audioElement.removeEventListener('play', handleStart);
        audioElement.removeEventListener('pause', handlePause);
        URL.revokeObjectURL(audioElement.src);
      }
    };
  }, [setIsPlaying]);

  return { audioRef };
}
