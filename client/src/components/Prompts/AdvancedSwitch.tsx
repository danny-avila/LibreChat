import { useRecoilState, useSetRecoilState } from 'recoil';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui';
import { useLocalize } from '~/hooks';
import store from '~/store';
const { PromptsEditorMode, promptsEditorMode, alwaysMakeProd } = store;

const AdvancedSwitch = () => {
  const localize = useLocalize();
  const [mode, setMode] = useRecoilState(promptsEditorMode);
  const setAlwaysMakeProd = useSetRecoilState(alwaysMakeProd);

  return (
    <Tabs
      defaultValue={mode}
      className="w-auto rounded-lg"
      onValueChange={(value) => {
        value === PromptsEditorMode.SIMPLE && setAlwaysMakeProd(true);
        setMode(value);
      }}
    >
      <TabsList className="grid w-auto grid-cols-2 bg-surface-tertiary">
        <TabsTrigger
          value={PromptsEditorMode.SIMPLE}
          className="w-20 min-w-0 rounded-md text-xs md:w-auto md:text-sm"
        >
          {localize('com_ui_simple')}
        </TabsTrigger>
        <TabsTrigger
          value={PromptsEditorMode.ADVANCED}
          className="w-20 min-w-0 rounded-md text-xs md:w-auto md:text-sm"
        >
          {localize('com_ui_advanced')}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
};

export default AdvancedSwitch;
