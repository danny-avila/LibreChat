import { Dropdown } from '~/components/ui';
import { useEffect, useState } from 'react';

export default function FontSizeChanger() {
  const getInitialFontSize = () => localStorage.getItem('fontSize') || '16';
  const [fontSize, setFontSize] = useState<string>(getInitialFontSize);

  useEffect(() => {
    const savedFontSize = localStorage.getItem('fontSize') || '16';
    setFontSize(savedFontSize);
  }, []);

  const handleChange = (val: string) => {
    setFontSize(val);
    localStorage.setItem('fontSize', val);
    document.documentElement.style.setProperty('--base-font-size', val + 'px');
  };

  return (
    <div className="flex items-center justify-between">
      <div>Font Size</div>
      <Dropdown
        value={fontSize}
        onChange={handleChange}
        options={['12', '14', '16', '18', '20']}
        width={100}
        position={'left'}
        maxHeight="200px"
        testId="font-size-selector"
      />
    </div>
  );
}
