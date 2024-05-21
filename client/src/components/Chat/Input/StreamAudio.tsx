import { useEffect, useState, useRef } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { MediaSourceAppender } from '~/hooks/Audio/MediaSourceAppender';
import store from '~/store';

function timeoutPromise(ms: number, message?: string) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message ?? 'Promise timed out')), ms),
  );
}

const promiseTimeoutMessage = 'Reader promise timed out';
const maxPromiseTime = 15000;

export default function StreamAudio({ index = 0 }) {
  const audioRunId = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioSourceRef = useRef<MediaSourceAppender | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const activeRunId = useRecoilValue(store.activeRunFamily(index));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const latestMessage = useRecoilValue(store.latestMessageFamily(index));
  const [audioURL, setAudioURL] = useRecoilState(store.audioURLFamily(index));

  useEffect(() => {
    const shouldFetch =
      isSubmitting &&
      latestMessage &&
      !latestMessage.isCreatedByUser &&
      (latestMessage.text || latestMessage.content) &&
      latestMessage.messageId &&
      !latestMessage.messageId.includes('_') &&
      !isFetching &&
      activeRunId &&
      activeRunId !== audioRunId.current;

    if (!shouldFetch) {
      return;
    }

    async function fetchAudio() {
      setIsFetching(true);

      try {
        if (audioRef.current) {
          audioRef.current.pause();
          URL.revokeObjectURL(audioRef.current.src);
          setAudioURL(null);
        }

        const response = await fetch('/api/files/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: latestMessage?.messageId, runId: activeRunId }),
        });

        if (!response.ok) {
          throw new Error('Failed to fetch audio');
        }
        if (!response.body) {
          throw new Error('Null Response body');
        }

        const reader = response.body.getReader();
        audioSourceRef.current = new MediaSourceAppender('audio/mpeg');
        setAudioURL(audioSourceRef.current.mediaSourceUrl);
        audioRunId.current = activeRunId;

        let done = false;

        while (!done) {
          const readPromise = reader.read();
          const { value, done: readerDone } = (await Promise.race([
            readPromise,
            timeoutPromise(maxPromiseTime, promiseTimeoutMessage),
          ])) as ReadableStreamReadResult<Uint8Array>;

          if (value) {
            audioSourceRef.current.addData(value);
          }
          done = readerDone;
        }

        console.log('Audio stream reading ended');
      } catch (error) {
        if (error?.['message'] !== promiseTimeoutMessage) {
          console.log(promiseTimeoutMessage);
          return;
        }
        console.error('Error fetching audio:', error);
        setIsFetching(false);
        setAudioURL(null);
      } finally {
        setIsFetching(false);
      }
    }

    fetchAudio();
  }, [isSubmitting, latestMessage, activeRunId, isFetching, setAudioURL]);

  return (
    <audio
      ref={audioRef}
      controls
      controlsList="nodownload nofullscreen noremoteplayback"
      className="absolute h-0 w-0 overflow-hidden"
      src={audioURL || undefined}
      autoPlay
    />
  );
}
