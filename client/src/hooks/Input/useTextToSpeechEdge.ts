import { useRecoilState } from 'recoil';
import { useState, useCallback } from 'react';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import store from '~/store';

function useTextToSpeechEdge() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceName] = useRecoilState(store.voice);
  const [tts, setTts] = useState<MsEdgeTTS | null>(null);

  const initializeTTS = useCallback(async () => {
    if (!tts) {
      const newTts = new MsEdgeTTS();
      await newTts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      setTts(newTts);
    }
  }, [tts, voiceName]);

  const generateSpeechEdge = useCallback(
    async (text) => {
      await initializeTTS();

      if (tts) {
        setIsSpeaking(true);
        const readable = tts.toStream(text);

        const audioContext = new window.AudioContext();
        const source = audioContext.createBufferSource();

        readable.on('data', async (data) => {
          const audioBuffer = await audioContext.decodeAudioData(data.buffer);
          source.buffer = audioBuffer;
          source.connect(audioContext.destination);
          source.start(0);
        });

        readable.on('close', () => {
          setIsSpeaking(false);
        });

        source.onended = () => {
          setIsSpeaking(false);
        };
      }
    },
    [tts, initializeTTS],
  );

  const cancelSpeechEdge = useCallback(() => {
    if (tts) {
      // there's no direct method to stop the stream in MsEdgeTTS
      // we can disconnect the audio context to stop the audio
      // not sure if this is the best way tho
      const audioContext = new window.AudioContext();
      audioContext.close();
      setIsSpeaking(false);
    }
  }, [tts]);

  return { generateSpeechEdge, cancelSpeechEdge, isSpeaking };
}

export default useTextToSpeechEdge;
