import { useEffect, useState, useRef } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { MediaSourceAppender } from '~/hooks/Audio/MediaSourceAppender';
import store from '~/store';

export default function StreamAudio({ index = 0 }) {
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const latestMessage = useRecoilValue(store.latestMessageFamily(index));
  const [audioURL, setAudioURL] = useRecoilState(store.audioURLFamily(index));
  const [isFetching, setIsFetching] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (
      isSubmitting &&
      latestMessage &&
      (latestMessage.text || latestMessage.content) &&
      !isFetching
    ) {
      setIsFetching(true);

      const fetchAudio = async () => {
        try {
          const response = await fetch('/api/files/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ messageId: latestMessage.messageId }),
          });

          if (!response.ok) {
            throw new Error('Failed to fetch audio');
          }

          if (!response.body) {
            throw new Error('Response body is null');
          }

          const reader = response.body.getReader();
          const audioSource = new MediaSourceAppender('audio/mpeg');
          setAudioURL(audioSource.mediaSourceUrl);

          let done = false;
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            if (value) {
              audioSource.addData(value);
            }
            done = readerDone;
          }

          console.log('Audio fetched successfully');
        } catch (error) {
          console.error('Failed to fetch audio:', error);
        } finally {
          setIsFetching(false);
        }
      };

      fetchAudio();
    }
  }, [isSubmitting, latestMessage, isFetching, setAudioURL]);

  useEffect(() => {
    if (audioURL && audioRef.current) {
      audioRef.current.play();
    }
  }, [audioURL]);

  return (
    audioURL != null && (
      <audio
        ref={audioRef}
        controls
        controlsList="nodownload nofullscreen noremoteplayback"
        className="absolute h-0 w-0 overflow-hidden"
        src={audioURL}
      />
    )
  );
}
