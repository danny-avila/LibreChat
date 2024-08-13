import React from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import type { Option } from '~/common';
import DropdownNoState from '~/components/ui/DropdownNoState';
import { useLocalize, useTextToSpeech } from '~/hooks';
import { logger } from '~/utils';
import store from '~/store';

export default function VoiceDropdown() {
  const localize = useLocalize();
  const { voices = [] } = useTextToSpeech();
  const [voice, setVoice] = useRecoilState(store.voice);
  const engineTTS = useRecoilValue<string>(store.engineTTS);

  const handleVoiceChange = (newValue?: string | Option) => {
    logger.log('Voice changed:', newValue);
    const newVoice = typeof newValue === 'string' ? newValue : newValue?.value;
    if (newVoice != null) {
      return setVoice(newVoice.toString());
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_voice_select')}</div>
      <DropdownNoState
        key={`voice-dropdown-${engineTTS}-${voices.length}`}
        value={voice}
        options={voices}
        onChange={handleVoiceChange}
        sizeClasses="min-w-[200px] !max-w-[400px] [--anchor-max-width:400px]"
        anchor="bottom start"
        testId="VoiceDropdown"
      />
    </div>
  );
}
