import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function ProgressText({ progress, error }: { progress: number; error?: boolean }) {
  const localize = useLocalize();

  const getText = () => {
    if (error) {
      return localize('com_ui_error');
    } else if (progress >= 1) {
      return localize('com_ui_image_created');
    } else if (progress >= 0.7) {
      return localize('com_ui_final_touch');
    } else if (progress >= 0.5) {
      return localize('com_ui_adding_details');
    } else if (progress >= 0.3) {
      return localize('com_ui_creating_image');
    } else {
      return localize('com_ui_getting_started');
    }
  };

  const text = getText();

  return (
    <div
      className={cn(
        'progress-text-content pointer-events-none absolute left-0 top-0 inline-flex w-full items-center gap-2 overflow-visible whitespace-nowrap',
      )}
    >
      <span className={`font-medium ${progress < 1 ? 'shimmer' : ''}`}>{text}</span>
    </div>
  );
}
