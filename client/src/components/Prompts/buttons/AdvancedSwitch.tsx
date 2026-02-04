import { useCallback, useMemo } from 'react';
import { Sparkles, Layers } from 'lucide-react';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { Radio } from '@librechat/client';
import { PromptsEditorMode } from '~/common';
import { useLocalize } from '~/hooks';
import store from '~/store';

const { promptsEditorMode, alwaysMakeProd } = store;

const AdvancedSwitch = () => {
  const localize = useLocalize();
  const [mode, setMode] = useRecoilState(promptsEditorMode);
  const setAlwaysMakeProd = useSetRecoilState(alwaysMakeProd);

  const options = useMemo(
    () => [
      {
        value: PromptsEditorMode.SIMPLE,
        label: localize('com_ui_simple'),
        icon: <Sparkles className="size-3.5" />,
      },
      {
        value: PromptsEditorMode.ADVANCED,
        label: localize('com_ui_advanced'),
        icon: <Layers className="size-3.5" />,
      },
    ],
    [localize],
  );

  const handleChange = useCallback(
    (value: string) => {
      if (value === PromptsEditorMode.SIMPLE) {
        setAlwaysMakeProd(true);
      }
      setMode(value as PromptsEditorMode);
    },
    [setMode, setAlwaysMakeProd],
  );

  return (
    <Radio
      options={options}
      value={mode}
      onChange={handleChange}
      className="border border-border-light"
    />
  );
};

export default AdvancedSwitch;
