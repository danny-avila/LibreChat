import { useRecoilState, useSetRecoilState } from 'recoil';
import { PromptsEditorMode } from '~/common';
import { useLocalize } from '~/hooks';
import store from '~/store';

const { promptsEditorMode, alwaysMakeProd } = store;

const AdvancedSwitch = () => {
  const localize = useLocalize();
  const [mode, setMode] = useRecoilState(promptsEditorMode);
  const setAlwaysMakeProd = useSetRecoilState(alwaysMakeProd);

  return (
    <div className="inline-flex h-10 items-center justify-center rounded-lg border border-border-light bg-surface-primary p-0.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50">
      <div className="flex flex-row items-stretch gap-0 whitespace-nowrap">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
            mode === PromptsEditorMode.SIMPLE
              ? 'bg-surface-tertiary text-text-primary'
              : 'bg-transparent text-text-tertiary hover:text-text-secondary'
          }`}
          onClick={() => {
            setAlwaysMakeProd(true);
            setMode(PromptsEditorMode.SIMPLE);
          }}
        >
          {localize('com_ui_simple')}
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
            mode === PromptsEditorMode.ADVANCED
              ? 'bg-surface-tertiary text-text-primary'
              : 'bg-transparent text-text-tertiary hover:text-text-secondary'
          }`}
          onClick={() => setMode(PromptsEditorMode.ADVANCED)}
        >
          {localize('com_ui_advanced')}
        </button>
      </div>
    </div>
  );
};

export default AdvancedSwitch;
