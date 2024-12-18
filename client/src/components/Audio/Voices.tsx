import React from 'react';
import { useRecoilState } from 'recoil';
import type { Option } from '~/common';
import { useLocalize, useTTSBrowser, useTTSEdge, useTTSExternal } from '~/hooks';
import { Dropdown } from '~/components/ui';
import { logger } from '~/utils';
import store from '~/store';

export function EdgeVoiceDropdown() {
  const localize = useLocalize();
  const { voices = [] } = useTTSEdge();
  const [voice, setVoice] = useRecoilState(store.voice);

  const handleVoiceChange = (newValue?: string | Option) => {
    logger.log('Edge Voice changed:', newValue);
    const newVoice = typeof newValue === 'string' ? newValue : newValue?.value;
    if (newVoice != null) {
      return setVoice(newVoice.toString());
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_voice_select')}</div>
      <Dropdown
        key={`edge-voice-dropdown-${voices.length}`}
        value={voice ?? ''}
        options={voices}
        onChange={handleVoiceChange}
        sizeClasses="min-w-[200px] !max-w-[400px] [--anchor-max-width:400px]"
        testId="EdgeVoiceDropdown"
      />
    </div>
  );
}

export function BrowserVoiceDropdown() {
  const localize = useLocalize();
  const { voices = [] } = useTTSBrowser();
  const [voice, setVoice] = useRecoilState(store.voice);

  const handleVoiceChange = (newValue?: string | Option) => {
    logger.log('Browser Voice changed:', newValue);
    const newVoice = typeof newValue === 'string' ? newValue : newValue?.value;
    if (newVoice != null) {
      return setVoice(newVoice.toString());
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_voice_select')}</div>
      <Dropdown
        key={`browser-voice-dropdown-${voices.length}`}
        value={voice ?? ''}
        options={voices}
        onChange={handleVoiceChange}
        sizeClasses="min-w-[200px] !max-w-[400px] [--anchor-max-width:400px]"
        testId="BrowserVoiceDropdown"
      />
    </div>
  );
}

export function ExternalVoiceDropdown() {
  const localize = useLocalize();
  const { voices = [] } = useTTSExternal();
  const [voice, setVoice] = useRecoilState(store.voice);

  const handleVoiceChange = (newValue?: string | Option) => {
    logger.log('External Voice changed:', newValue);
    const newVoice = typeof newValue === 'string' ? newValue : newValue?.value;
    if (newVoice != null) {
      return setVoice(newVoice.toString());
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_voice_select')}</div>
      <Dropdown
        key={`external-voice-dropdown-${voices.length}`}
        value={voice ?? ''}
        options={voices}
        onChange={handleVoiceChange}
        sizeClasses="min-w-[200px] !max-w-[400px] [--anchor-max-width:400px]"
        testId="ExternalVoiceDropdown"
      />
    </div>
  );
}
