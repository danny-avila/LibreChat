import React from 'react';
import { useRecoilState } from 'recoil';
import { Dropdown } from '@librechat/client';
import { TTSProviders } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';

interface EngineTTSDropdownProps {
  external: boolean;
}

const EngineTTSDropdown: React.FC<EngineTTSDropdownProps> = ({ external }) => {
  const localize = useLocalize();
  const [engineTTS, setEngineTTS] = useRecoilState<string>(store.engineTTS);

  const endpointOptions = external
    ? [
        { value: 'browser', label: localize('com_nav_browser') },
        { value: 'external', label: localize('com_nav_external') },
        { value: TTSProviders.OPENAI, label: localize('com_ui_openai') },
        { value: TTSProviders.AZURE_OPENAI, label: localize('com_ui_azure') },
        { value: TTSProviders.ELEVENLABS, label: 'ElevenLabs' },
        { value: TTSProviders.LOCALAI, label: 'LocalAI' },
      ]
    : [{ value: 'browser', label: localize('com_nav_browser') }];

  const handleSelect = (value: string) => {
    setEngineTTS(value);
  };

  const labelId = 'engine-tts-dropdown-label';

  return (
    <div className="flex items-center justify-between">
      <div id={labelId}>{localize('com_nav_engine')}</div>
      <Dropdown
        value={engineTTS}
        onChange={handleSelect}
        options={endpointOptions}
        sizeClasses="w-[180px]"
        testId="EngineTTSDropdown"
        className="z-50"
        aria-labelledby={labelId}
      />
    </div>
  );
};

export default EngineTTSDropdown;
