import { Spinner } from '@librechat/client';
import useAutoFocus from './useAutoFocus';
import { useLocalize } from '~/hooks';

export default function Loading() {
  const localize = useLocalize();
  const ref = useAutoFocus<HTMLDivElement, boolean>(true);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 py-8 text-sm text-text-secondary focus:outline-none"
    >
      <Spinner className="size-6" aria-hidden="true" />
      <span>{localize('com_ui_importing')}</span>
    </div>
  );
}
