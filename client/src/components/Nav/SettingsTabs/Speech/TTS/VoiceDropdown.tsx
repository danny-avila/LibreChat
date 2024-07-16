import React, { useEffect, useState, useMemo } from 'react';
import { useRecoilState } from 'recoil';
import Dropdown from '~/components/ui/DropdownNoState';
import { useLocalize, useTextToSpeech } from '~/hooks';
import store from '~/store';

export default function VoiceDropdown() {
  const localize = useLocalize();
  const [voice, setVoice] = useRecoilState(store.voice);
  const { voices } = useTextToSpeech();
  const [voiceOptions, setVoiceOptions] = useState([]);
  const [engineTTS] = useRecoilState(store.engineTTS);

  useEffect(() => {
    async function fetchVoices() {
      const options = await voices();
      setVoiceOptions(options);

      if (!voice && options.length > 0) {
        setVoice(options[0]);
      }
    }

    fetchVoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineTTS]);

  const memoizedVoiceOptions = useMemo(() => voiceOptions, [voiceOptions]);

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_voice_select')}</div>
      <Dropdown
        value={voice}
        onChange={setVoice}
        options={memoizedVoiceOptions}
        sizeClasses="min-w-[200px] !max-w-[400px] [--anchor-max-width:400px]"
        anchor="bottom start"
        testId="VoiceDropdown"
      />
    </div>
  );
}
