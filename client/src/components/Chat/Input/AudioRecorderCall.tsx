import React, { useEffect, useState } from 'react';
import { CircleIcon, CircleDotsIcon } from '~/components/svg';
import { useSpeechToTextCall, useSubmitMessageSpeech } from '~/hooks';
import { useChatFormContext } from '~/Providers';
import { globalAudioId } from '~/common';
import store from '~/store';
import { useRecoilState } from 'recoil';
import { usePauseGlobalAudio } from '~/hooks/Audio';
import CameraFeed from './CameraFeed';

let isThinking = false;

export default function AudioRecorderCall({
  textAreaRef,
  methods,
  ask,
  disabled,
}: {
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  methods: ReturnType<typeof useChatFormContext>;
  ask: (data: { text: string }) => void;
  disabled: boolean;
}) {
  const { submitPrompt } = useSubmitMessageSpeech();
  const [isStreamingAudio, setIsStreamingAudio] = useRecoilState(store.isStreamingAudio);

  const { pauseGlobalAudio } = usePauseGlobalAudio();
  const [showCallOverlay, setShowCallOverlay] = useRecoilState(store.showCallOverlay);
  const [isCameraOn, setIsCameraOn] = useState(false);

  const handleTranscriptionComplete = (text: string) => {
    if (text) {
      const globalAudio = document.getElementById(globalAudioId) as HTMLAudioElement;
      if (globalAudio) {
        console.log('Unmuting global audio');
        globalAudio.muted = false;
      }
      ask({ text });
      methods.reset({ text: '' });
      clearText();
    }
  };

  const { isListening, isLoading, startRecording, stopRecording, speechText, clearText, rmsLevel } =
    useSpeechToTextCall(handleTranscriptionComplete);

  useEffect(() => {
    if (textAreaRef.current) {
      submitPrompt(speechText);
    }
  }, [speechText, methods, textAreaRef]);

  const handleStartRecording = async () => {
    await startRecording();
  };

  const handleStopRecording = async () => {
    isThinking = true;
    await stopRecording();
  };

  const handleCloseOverlay = () => {
    if (isListening) {handleStopRecording();}
    setShowCallOverlay(false);
  };

  const handleScreenshot = (dataURL: string) => {
    if (textAreaRef.current) {
      textAreaRef.current.value = dataURL;
      submitPrompt(dataURL);
    }
  };

  const renderIcon = () => {
    const transformScale =
      rmsLevel > 0.08
        ? 1.8
        : rmsLevel > 0.07
          ? 1.6
          : rmsLevel > 0.05
            ? 1.4
            : rmsLevel > 0.01
              ? 1.2
              : 1;

    return (
      <div className="smooth-transition" style={{ transform: `scale(${transformScale})` }}>
        <CircleIcon size="256" />
      </div>
    );
  };

  const renderDotsIcon = () => {
    if (isListening) {
      return <CircleDotsIcon />;
    }
    if (isLoading) {
      return <CircleDotsIcon className="" />;
    }
    return <CircleDotsIcon className="" />;
  };

  function renderStatus() {
    if (isListening) {
      return <span className="mt-0 text-black dark:text-white">Ouvindo...</span>;
    } else if (isStreamingAudio) {
      isThinking = false;
      return <span className="mt-0 text-black dark:text-white">Clique para interromper...</span>;
    } else if (isLoading || isThinking) {
      isThinking = true;
      return <span className="mt-0 text-black dark:text-white">Processando...</span>;
    } else if (!isThinking) {
      return <span className="mt-0 text-black dark:text-white">Clique para falar...</span>;
    }
  }

  return (
    <>
      <div className="absolute bottom-12 flex w-full justify-center">{renderStatus()}</div>
      <div className="relative flex flex-col items-center justify-center space-y-0 text-lg text-white">
        {!isStreamingAudio ? (
          <button
            onClick={isListening ? handleStopRecording : handleStartRecording}
            disabled={disabled}
            className="m-0 p-0"
            type="button"
          >
            {renderIcon()}
          </button>
        ) : (
          <button
            onClickCapture={() => {
              setIsStreamingAudio(false);
              pauseGlobalAudio();
            }}
            disabled={disabled}
            className="m-0 p-0"
            type="button"
          >
            {renderDotsIcon()}
          </button>
        )}
        {isCameraOn && (
          <CameraFeed onClose={() => setIsCameraOn(false)} onScreenshot={handleScreenshot} />
        )}
      </div>

      <div className="absolute bottom-10 flex w-full justify-center gap-80">
        <button
          className="rounded-full bg-gray-50 p-3 hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-800"
          onClick={() => setIsCameraOn(true)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            className="size-5 text-black"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"
            />
          </svg>
        </button>
        <button
          className="rounded-full bg-gray-50 p-3 hover:bg-gray-100 dark:bg-gray-200 dark:hover:bg-gray-800"
          onClick={handleCloseOverlay}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="size-5 text-black"
          >
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>
    </>
  );
}
