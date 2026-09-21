import { Skeleton, Spinner } from '@librechat/client';
import OpenSidebar from './Menus/OpenSidebar';
import { useLocalize } from '~/hooks';

export default function Loading() {
  const localize = useLocalize();

  return (
    <main className="relative flex h-full min-h-0 w-full flex-col bg-presentation">
      <div className="flex h-[52px] shrink-0 items-center gap-2 p-2">
        <div className="md:hidden">
          <OpenSidebar testId="header-open-sidebar-button" />
        </div>
        <Skeleton className="h-8 w-32 motion-reduce:animate-none md:ml-3" aria-hidden="true" />
      </div>
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3 text-text-secondary"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <Spinner className="text-text-primary motion-reduce:animate-none" aria-hidden="true" />
        <span className="text-sm">{localize('com_ui_loading')}</span>
      </div>
    </main>
  );
}
