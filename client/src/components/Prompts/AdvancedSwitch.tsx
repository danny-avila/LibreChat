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
    <div className="relative flex h-10 items-center justify-center rounded-xl border border-border-light bg-surface-primary transition-all duration-300">
      <div className="relative flex w-48 items-stretch md:w-64">
        <div
          className="absolute rounded-lg bg-surface-hover shadow-lg transition-all duration-300 ease-in-out"
          style={{
            top: '1px',
            left: mode === PromptsEditorMode.SIMPLE ? '2px' : 'calc(50% + 2px)',
            width: 'calc(50% - 4px)',
            height: 'calc(100% - 2px)',
          }}
        />

        {/* Simple Mode Button */}
        <button
          type="button"
          onClick={() => {
            setAlwaysMakeProd(true);
            setMode(PromptsEditorMode.SIMPLE);
          }}
          className={`relative z-10 flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300 md:px-6 ${
            mode === PromptsEditorMode.SIMPLE
              ? 'text-text-primary'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <span className="relative">{localize('com_ui_simple')}</span>
        </button>

        {/* Advanced Mode Button */}
        <button
          type="button"
          onClick={() => setMode(PromptsEditorMode.ADVANCED)}
          className={`relative z-10 flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300 md:px-6 ${
            mode === PromptsEditorMode.ADVANCED
              ? 'text-text-primary'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <span className="relative">{localize('com_ui_advanced')}</span>
        </button>
      </div>
    </div>
  );
};

export default AdvancedSwitch;
