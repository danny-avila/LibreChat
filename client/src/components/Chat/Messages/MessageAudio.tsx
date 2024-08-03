import { useEffect, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui';
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
  const [audioText, setAudioText] = useState<string>(localize('com_ui_info_read_aloud'));
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [wasLongPress, setWasLongPress] = useState(false);

  const { toggleSpeech, isSpeaking, isLoading, audioRef } = useTextToSpeech(message, isLast, index);

  const isMouseDownRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const counterRef = useRef(0);

  const renderIcon = (size: string) => {
    if (isLoading) {
      return <Spinner size={size} />;
    }
    return isSpeaking ? <VolumeMuteIcon size={size} /> : <VolumeIcon size={size} />;
  };

  const handleMouseDown = () => {
    setWasLongPress(false);
    setTooltipOpen(true);
    if (isMouseDownRef.current) {
      return;
    }
    isMouseDownRef.current = true;
    counterRef.current = 2;
    setAudioText(localize('com_ui_hold_mouse_download', counterRef.current.toString()));
    timerRef.current = setInterval(() => {
      counterRef.current--;
      if (counterRef.current >= 0) {
        setAudioText(localize('com_ui_hold_mouse_download', counterRef.current.toString()));
      }
      if (isMouseDownRef.current && counterRef.current === 0) {
        setAudioText(localize('com_ui_downloading'));
        toggleSpeech(true);
      }
      if (counterRef.current < 0 && timerRef.current) {
        clearInterval(timerRef.current);
      }
    }, 1000);

    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseUp = () => {
    if (counterRef.current > 0) {
      toggleSpeech(false);
    }

    if (counterRef.current === 0) {
      setWasLongPress(true);
    }

    setTooltipOpen(false);
    isMouseDownRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      setAudioText(localize('com_ui_info_read_aloud'));
    }

    window.removeEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    const messageAudio = document.getElementById(
      `audio-${message.messageId}`,
    ) as HTMLAudioElement | null;
    if (
      messageAudio &&
      playbackRate !== null &&
      playbackRate > 0 &&
      messageAudio.playbackRate !== playbackRate
    ) {
      messageAudio.playbackRate = playbackRate;
    }
  }, [audioRef, isSpeaking, playbackRate, message.messageId]);

  return (
    <TooltipProvider>
      <>
        <Tooltip open={tooltipOpen}>
          <TooltipTrigger asChild>
            <button
              className="hover-button rounded-md p-1 pl-0 text-gray-400 hover:text-gray-950 dark:text-gray-400/70 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:group-hover:visible md:group-[.final-completion]:visible"
              onMouseDownCapture={handleMouseDown}
              onMouseUpCapture={handleMouseUp}
              onMouseEnter={() => setTooltipOpen(true)}
              onMouseLeave={() => setTooltipOpen(false)}
              onClickCapture={() => {
                if (!wasLongPress && audioRef.current) {
                  audioRef.current.muted = false;
                  toggleSpeech(false);
                }
              }}
              type="button"
            >
              {renderIcon('19')}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={0}>
            <div className="space-y-2">
              {isSpeaking ? (
                <p className="text-center text-sm text-gray-600 dark:text-gray-300">
                  {localize('com_ui_stop')}
                </p>
              ) : (
                <p className="text-center text-sm text-gray-600 dark:text-gray-300">
                  {localize('com_ui_read_aloud')}
                  <br />
                  {audioText}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
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
    </TooltipProvider>
  );
}
