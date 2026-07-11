import { memo } from 'react';
import { Zap } from 'lucide-react';
import { useLocalize } from '~/hooks';

/**
 * A mid-run steering message rendered inline within the assistant response —
 * a user-style bubble marking where the user's words entered the run. The
 * part is server-persisted (`ContentTypes.STEER`), so this renders
 * identically live, on reload, and in shared/search views.
 */
const SteerBubble = memo(function SteerBubble({ steer }: { steer: string }) {
  const localize = useLocalize();
  if (typeof steer !== 'string' || steer.length === 0) {
    return null;
  }
  return (
    <div className="my-3 flex w-full flex-col items-end" data-testid="steer-bubble">
      <span className="mb-1 flex items-center gap-1 text-xs text-text-tertiary">
        <Zap className="h-3 w-3 text-amber-500" aria-hidden="true" />
        {localize('com_ui_steered_label')}
      </span>
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-surface-secondary px-4 py-2.5 text-text-primary">
        {steer}
      </div>
    </div>
  );
});

export default SteerBubble;
