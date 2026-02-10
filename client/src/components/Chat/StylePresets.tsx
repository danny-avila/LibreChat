import { useRecoilState, useRecoilValue } from 'recoil';
import { FEATURES } from './featureConfig';
import store from '~/store';

export default function StylePresets() {
  const activeFeature = useRecoilValue(store.activeFeature);
  const [activePreset, setActivePreset] = useRecoilState(store.activeStylePreset);

  if (!activeFeature || !FEATURES[activeFeature]) {
    return null;
  }

  const { stylePresets, color } = FEATURES[activeFeature];

  if (!stylePresets.length) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      {stylePresets.map(({ label, value }) => {
        const isSelected = activePreset === value;
        return (
          <button
            key={value}
            onClick={() => setActivePreset(isSelected ? null : value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
              isSelected
                ? 'border-transparent text-white'
                : 'border-border-medium text-text-secondary hover:border-border-heavy hover:text-text-primary'
            }`}
            style={
              isSelected
                ? { backgroundColor: `var(--feature-${color}-icon)` }
                : undefined
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
