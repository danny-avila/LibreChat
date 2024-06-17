import { useRecoilState } from 'recoil';
import { useMemo, useEffect } from 'react';
import Dropdown from '~/components/ui/DropdownNoState';
import { useVoicesQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function VoiceDropdown() {
  const localize = useLocalize();
  const [voice, setVoice] = useRecoilState(store.voice);
  const { data } = useVoicesQuery();

  useEffect(() => {
    if (!voice && data?.length) {
      setVoice(data[0]);
    }
  }, [voice, data, setVoice]);

  const voiceOptions = useMemo(
    () => (data ?? []).map((v: string) => ({ value: v, display: v })),
    [data],
  );

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_voice_select')}</div>
      <Dropdown
        value={voice}
        onChange={(value: string) => setVoice(value)}
        options={voiceOptions}
        width={220}
        position={'left'}
        testId="VoiceDropdown"
      />
    </div>
  );
}
