import React, { useEffect, useRef } from 'react';
import AudioRecorderCall from './AudioRecorderCall';
import StreamAudioCall from './StreamAudioCall';
import { useChatFormContext } from '~/Providers';

function CallOverlay({
  eventTarget,
  showCallOverlay,
  disableInputs,
  textAreaRef,
  methods,
  index,
  TextToSpeech,
  automaticPlayback,
  ask,
}: {
  eventTarget: EventTarget;
  showCallOverlay: boolean;
  disableInputs: boolean;
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
  methods: ReturnType<typeof useChatFormContext>;
  index: number;
  TextToSpeech: boolean;
  automaticPlayback: boolean;
  ask: (data: { text: string }) => void;
}) {
  useEffect(() => {
    if (showCallOverlay) {
      eventTarget.dispatchEvent(new Event('callOverlayOpened'));
    } else {
      eventTarget.dispatchEvent(new Event('callOverlayClosed'));
    }
  }, [showCallOverlay, eventTarget]);

  if (!showCallOverlay) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-white dark:bg-black">
      <AudioRecorderCall
        disabled={!!disableInputs}
        textAreaRef={textAreaRef}
        ask={ask}
        methods={methods}
      />
      {TextToSpeech && automaticPlayback && <StreamAudioCall index={index} />}
    </div>
  );
}

export default CallOverlay;
