import { useEffect } from 'react';
import { request } from 'librechat-data-provider';
import { useRecoilState, useRecoilValue } from 'recoil';
import { MediaSourceAppender } from '~/hooks/Audio/MediaSourceAppender';
import store from '~/store';

export default function StreamAudio({ index = 0 }) {
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(index));
  const latestMessage = useRecoilValue(store.latestMessageFamily(index));
  const [audioURL, setAudioURL] = useRecoilState(store.audioURLFamily(index));

  useEffect(() => {
    if (isSubmitting && latestMessage && (latestMessage.text || latestMessage.content)) {
      const audioSource = new MediaSourceAppender('audio/mpeg');
      setAudioURL(audioSource.mediaSourceUrl);

      const fetchAudio = async () => {
        try {
          console.log('Fetching audio...');
          const response = await request.post('/api/files/tts', {
            messageId: latestMessage.messageId,
          });
          const reader = response.body.getReader();
          let done = false;

          while (!done) {
            const { value, done: readerDone } = await reader.read();
            if (value) {
              audioSource.addData(value);
            }
            done = readerDone;
          }
        } catch (error) {
          console.error('Failed to fetch audio:', error);
        }
      };

      fetchAudio();
    }
  }, [latestMessage, isSubmitting, setAudioURL]);

  return (
    audioURL != null && (
      <audio
        controls
        controlsList="nodownload nofullscreen noremoteplayback"
        className="absolute h-0 w-0 overflow-hidden"
        autoPlay={true}
        src={audioURL}
      />
    )
  );
}
