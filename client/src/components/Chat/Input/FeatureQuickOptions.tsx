import { useRecoilValue } from 'recoil';
import { useChatFormContext } from '~/Providers';
import { FEATURES } from '../featureConfig';
import store from '~/store';

export default function FeatureQuickOptions() {
  const activeFeature = useRecoilValue(store.activeFeature);
  const methods = useChatFormContext();

  if (!activeFeature || !FEATURES[activeFeature]?.quickOptions?.length) {
    return null;
  }

  const { quickOptions = [], color } = FEATURES[activeFeature];

  const handleClick = (prompt: string) => {
    methods.setValue('text', prompt, { shouldValidate: true });
  };

  return (
    <div className="flex flex-wrap gap-1.5 px-3 pb-1">
      {quickOptions.map(({ label, prompt }) => (
        <button
          key={label}
          type="button"
          onClick={() => handleClick(prompt)}
          className="rounded-full border border-border-light px-3 py-1 text-[11px] font-medium text-text-secondary transition-all hover:border-transparent hover:text-white"
          style={{
            ['--hover-bg' as string]: `var(--feature-${color})`,
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.backgroundColor = `var(--feature-${color})`;
            (e.target as HTMLElement).style.color = `var(--feature-${color}-icon)`;
            (e.target as HTMLElement).style.borderColor = 'transparent';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.backgroundColor = '';
            (e.target as HTMLElement).style.color = '';
            (e.target as HTMLElement).style.borderColor = '';
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
