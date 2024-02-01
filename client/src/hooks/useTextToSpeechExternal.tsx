import { useEffect } from 'react';
import { useTextToSpeechMutation } from '~/data-provider';
import { useToastContext } from '~/Providers';

function useTextToSpeechExternal() {
  const { showToast } = useToastContext();

  const { mutate: processAudio, isLoading: isProcessing } = useTextToSpeechMutation({
    onSuccess: (data) => {
      const audio = data.audio;
      console.log('audio', audio);
    },
    onError: (error) => {
      showToast({ message: `Error: ${error}`, status: 'error' });
    },
  });

  const synthesizeSpeech = (text, onEnd) => {
    console.log(text);

    const formData = new FormData();
    formData.append('text', text);

    processAudio(formData);
  };

  const cancelSpeech = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
  };

  useEffect(() => {
    return () => {
      cancelSpeech();
    };
  }, []);

  return { synthesizeSpeech, cancelSpeech, isProcessing };
}

export default useTextToSpeechExternal;
