import { useEffect, useState, useRef } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { MediaSourceAppender } from '~/hooks/Audio/MediaSourceAppender';
import store from '~/store';

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
      latestMessage.isCreatedByUser === false &&
      (latestMessage.text || latestMessage.content) &&
      !latestMessage.messageId.includes('_') &&
      !isFetching &&
      activeRunId &&
      activeRunId !== audioRunId.current;

    if (shouldFetch) {
      setIsFetching(true);
      const fetchAudio = async () => {
        try {
          console.log('Fetching audio...');
          console.log('latestMessage', latestMessage);
          const response = await fetch('/api/files/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messageId: latestMessage.messageId, runId: activeRunId }),
          });

          if (!response.ok) {
            throw new Error('Failed to fetch audio');
          }

          if (!response.body) {
            throw new Error('Response body is null');
          }

          const reader = response.body.getReader();

          audioSourceRef.current = new MediaSourceAppender('audio/mpeg');
          setAudioURL(audioSourceRef.current.mediaSourceUrl);
          audioRunId.current = activeRunId;
          console.log('audioRunId.current', audioRunId.current);
          setIsFetching(false);
          console.log('setting fetching to false');

          let done = false;
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            if (value) {
              audioSourceRef.current.addData(value);
            }
            done = readerDone;
          }

          console.log('Audio fetched successfully');
        } catch (error) {
          console.error('Failed to fetch audio:', error);
          setIsFetching(false);
          setAudioURL(null);
        }
      };

      fetchAudio();
    }
  }, [isSubmitting, latestMessage, activeRunId, isFetching, setAudioURL]);

  return (
    <audio
      ref={audioRef}
      controls
      controlsList="nodownload nofullscreen noremoteplayback"
      className="absolute h-0 w-0 overflow-hidden"
      src={audioURL ? audioURL : undefined}
      autoPlay
    />
  );
}
