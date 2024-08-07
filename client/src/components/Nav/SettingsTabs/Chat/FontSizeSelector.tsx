import { useRecoilState } from 'recoil';
import { Dropdown } from '~/components/ui';
import { applyFontSize } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function FontSizeSelector() {
  const [fontSize, setFontSize] = useRecoilState(store.fontSize);
  const localize = useLocalize();

  const handleChange = (val: string) => {
    setFontSize(val);
    applyFontSize(val);
  };

  const options = [
    { value: 'text-xs', display: localize('com_nav_font_size_xs') },
    { value: 'text-sm', display: localize('com_nav_font_size_sm') },
    { value: 'text-base', display: localize('com_nav_font_size_base') },
    { value: 'text-lg', display: localize('com_nav_font_size_lg') },
    { value: 'text-xl', display: localize('com_nav_font_size_xl') },
  ];

  return (
    <div className="flex w-full items-center justify-between">
      <div>{localize('com_nav_font_size')}</div>
      <Dropdown
        value={fontSize}
        options={options}
        onChange={handleChange}
        testId="font-size-selector"
        sizeClasses="w-[150px]"
        anchor="bottom start"
      />
    </div>
  );
}
