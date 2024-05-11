import { useRecoilState } from 'recoil';
import { Dropdown } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function EngineSTTDropdown() {
  const localize = useLocalize();
  const [endpointSTT, setEndpointSTT] = useRecoilState<string>(store.endpointSTT);
  const endpointOptions = [
    { value: 'browser', display: localize('com_nav_browser') },
    { value: 'external', display: localize('com_nav_external') },
  ];

  const handleSelect = (value: string) => {
    setEndpointSTT(value);
  };

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_engine')}</div>
      <Dropdown
        value={endpointSTT}
        onChange={handleSelect}
        options={endpointOptions}
        width={220}
        position={'left'}
        testId="EngineSTTDropdown"
      />
    </div>
  );
}
