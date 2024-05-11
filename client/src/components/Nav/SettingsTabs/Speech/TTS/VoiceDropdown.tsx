import { useEffect, useState } from 'react';
import { useRecoilState } from 'recoil';
import { useVoicesMutation } from '~/data-provider';
import { Dropdown } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';
import { useToastContext } from '~/Providers';

export default function VoiceDropdown() {
  const localize = useLocalize();
  const [voice, setVoice] = useRecoilState<string>(store.voice);
  const [voices, setVoices] = useState<string[]>([]);
  const { showToast } = useToastContext();

  const { mutate: getVoices } = useVoicesMutation({
    onSuccess: (data: string[] | undefined) => {
      if (Array.isArray(data)) {
        setVoices(data);
      } else {
        new Error('Invalid voices data');
      }
    },
    onError: (error: unknown) => {
      showToast({ message: `Error getting voices: ${error}`, status: 'error' });
    },
  });

  useEffect(() => {
    if (voices.length === 0) {
      getVoices({});
    }
  }, []);

  const voiceOptions = voices.map((v: string) => ({ value: v, display: v }));

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
