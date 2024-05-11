import { useRecoilState } from 'recoil';
import { Dropdown } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function EngineTTSDropdown() {
  const localize = useLocalize();
  const [endpointTTS, setEndpointTTS] = useRecoilState<string>(store.endpointTTS);
  const endpointOptions = [
    { value: 'browser', display: localize('com_nav_browser') },
    { value: 'external', display: localize('com_nav_external') },
  ];

  const handleSelect = (value: string) => {
    setEndpointTTS(value);
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_engine')}</div>
      <Dropdown
        value={endpointTTS}
        onChange={handleSelect}
        options={endpointOptions}
        width={220}
        position={'left'}
        testId="EngineTTSDropdown"
      />
    </div>
  );
}
