import { useRecoilState } from 'recoil';
import { Dropdown } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function EngineTTSDropdown() {
  const localize = useLocalize();
  const [engineTTS, setEngineTTS] = useRecoilState<string>(store.engineTTS);
  const endpointOptions = [
    { value: 'browser', display: localize('com_nav_browser') },
    { value: 'external', display: localize('com_nav_external') },
  ];

  const handleSelect = (value: string) => {
    setEngineTTS(value);
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_engine')}</div>
      <Dropdown
        value={engineTTS}
        onChange={handleSelect}
        options={endpointOptions}
        sizeClasses="w-[180px]"
        anchor="bottom start"
        testId="EngineTTSDropdown"
      />
    </div>
  );
}
