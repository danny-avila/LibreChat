import { useEffect } from 'react';
import { useRecoilValue } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import { VolumeIcon, VolumeMuteIcon, Spinner } from '~/components/svg';
import { useLocalize, useTextToSpeech } from '~/hooks';
import store from '~/store';

type THoverButtons = {
  message: TMessage;
  isLast: boolean;
  index: number;
};

export default function MessageAudio({ index, message, isLast }: THoverButtons) {
  const localize = useLocalize();
  const playbackRate = useRecoilValue(store.playbackRate);

  const { toggleSpeech, isSpeaking, isLoading, audioRef } = useTextToSpeech(message, isLast, index);

  const renderIcon = (size: string) => {
    if (isLoading) {
      return <Spinner size={size} />;
    }

    if (isSpeaking) {
      return <VolumeMuteIcon size={size} />;
    }

    return <VolumeIcon size={size} />;
  };

  useEffect(() => {
    const messageAudio = document.getElementById(
      `audio-${message.messageId}`,
    ) as HTMLAudioElement | null;
    if (!messageAudio) {
      return;
    }
    if (
      playbackRate &&
      playbackRate > 0 &&
      messageAudio &&
      messageAudio.playbackRate !== playbackRate
    ) {
      messageAudio.playbackRate = playbackRate;
    }
  }, [audioRef, isSpeaking, playbackRate, message.messageId]);

  return (
    <>
      <button
        className="hover-button rounded-md p-1 pl-0 text-gray-400 hover:text-gray-950 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:group-hover:visible md:group-[.final-completion]:visible"
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
        title={isSpeaking ? localize('com_ui_stop') : localize('com_ui_read_aloud')}
      >
        {renderIcon('19')}
      </button>
      <audio
        ref={audioRef}
        controls
        controlsList="nodownload nofullscreen noremoteplayback"
        style={{
          position: 'absolute',
          overflow: 'hidden',
          display: 'none',
          height: '0px',
          width: '0px',
        }}
        src={audioRef.current?.src || undefined}
        id={`audio-${message.messageId}`}
        muted
        autoPlay
      />
    </>
  );
}
