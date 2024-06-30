import { useRecoilState } from 'recoil';
import { Dropdown } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function EngineSTTDropdown() {
  const localize = useLocalize();
  const [engineSTT, setEngineSTT] = useRecoilState<string>(store.engineSTT);
  const endpointOptions = [
    { value: 'browser', display: localize('com_nav_browser') },
    { value: 'external', display: localize('com_nav_external') },
  ];

  const handleSelect = (value: string) => {
    setEngineSTT(value);
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_engine')}</div>
      <Dropdown
        value={engineSTT}
        onChange={handleSelect}
        options={endpointOptions}
        width={180}
        position={'left'}
        testId="EngineSTTDropdown"
      />
    </div>
  );
}
