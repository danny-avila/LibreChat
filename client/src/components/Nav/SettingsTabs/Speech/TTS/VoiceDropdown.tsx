import { useMemo } from 'react';
import { useRecoilState } from 'recoil';
import { useVoicesQuery } from '~/data-provider';
import { Dropdown } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function VoiceDropdown() {
  const localize = useLocalize();
  const [voice, setVoice] = useRecoilState<string>(store.voice);
  const { data } = useVoicesQuery();

  const voiceOptions = useMemo(
    () => (data?.voices ?? []).map((v: string) => ({ value: v, display: v })),
    [data],
  );

  const handleSelect = (value: string) => {
    setVoice(value);
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_voice_select')}</div>
      <Dropdown
        value={voice}
        onChange={handleSelect}
        options={voiceOptions}
        width={220}
        position={'left'}
        testId="VoiceDropdown"
      />
    </div>
  );
}
