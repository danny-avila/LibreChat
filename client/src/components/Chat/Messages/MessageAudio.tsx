// client/src/components/Chat/Messages/MessageAudio.tsx
import { useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import type { TMessageContentParts } from 'librechat-data-provider';
import { VolumeIcon, VolumeMuteIcon, Spinner } from '~/components/svg';
import { useLocalize, useTextToSpeech } from '~/hooks';
import { logger } from '~/utils';
import store from '~/store';

type THoverButtons = {
  messageId?: string;
  content?: TMessageContentParts[] | string;
  isLast: boolean;
  index: number;
};

export default function MessageAudio({ isLast, index, messageId, content }: THoverButtons) {
  const localize = useLocalize();
  const playbackRate = useRecoilValue(store.playbackRate);

  const { toggleSpeech, isSpeaking, isLoading, audioRef } = useTextToSpeech({
    isLast,
    index,
    messageId,
    content,
  });

  const renderIcon = (size: string) => {
    if (isLoading === true) {
      return <Spinner size={size} />;
    }

    if (isSpeaking === true) {
      return <VolumeMuteIcon size={size} />;
    }

    return <VolumeIcon size={size} />;
  };

  useEffect(() => {
    const messageAudio = document.getElementById(`audio-${messageId}`) as HTMLAudioElement | null;
    if (!messageAudio) {
      return;
    }
    if (playbackRate != null && playbackRate > 0 && messageAudio.playbackRate !== playbackRate) {
      messageAudio.playbackRate = playbackRate;
    }
  }, [audioRef, isSpeaking, playbackRate, messageId]);

  logger.log(
    'MessageAudio: audioRef.current?.src, audioRef.current',
    audioRef.current?.src,
    audioRef.current,
  );

  return (
    <>
      <button
        className="hover-button rounded-md p-1 pl-0 text-gray-500 hover:bg-gray-100 hover:text-gray-500 dark:text-gray-400/70 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:group-hover:visible md:group-[.final-completion]:visible"
        // onMouseDownCapture={() => {
        //   if (audioRef.current) {
        //     audioRef.current.muted = false;
        //   }
        //   handleMouseDown();
        // }}
        // onMouseUpCapture={() => {
        //   if (audioRef.current) {
        //     audioRef.current.muted = false;
        //   }
        //   handleMouseUp();
        // }}
        onClickCapture={() => {
          if (audioRef.current) {
            audioRef.current.muted = false;
          }
          toggleSpeech();
        }}
        type="button"
        title={isSpeaking === true ? localize('com_ui_stop') : localize('com_ui_read_aloud')}
      >
        {renderIcon('19')}
      </button>
      <audio
        ref={audioRef}
        controls
        preload="none"
        controlsList="nodownload nofullscreen noremoteplayback"
        style={{
          position: 'absolute',
          overflow: 'hidden',
          display: 'none',
          height: '0px',
          width: '0px',
        }}
        src={audioRef.current?.src}
        onError={(error) => {
          console.error('Error fetching audio:', error);
        }}
        id={`audio-${messageId}`}
        muted
        autoPlay
      />
    </>
  );
}
