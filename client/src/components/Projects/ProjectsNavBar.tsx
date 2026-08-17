import { Plus } from 'lucide-react';
import { Button, useMediaQuery } from '@librechat/client';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import { useLocalize } from '~/hooks';

type ProjectsNavBarProps = {
  onCreate: () => void;
};

export default function ProjectsNavBar({ onCreate }: ProjectsNavBarProps) {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <header className="sticky top-0 z-10 border-b border-border-light bg-presentation">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 md:h-16 md:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          {isSmallScreen ? <OpenSidebar className="size-9 shrink-0" /> : null}
          <h1 className="truncate text-balance text-lg font-semibold tracking-tight text-text-primary md:text-xl">
            {localize('com_ui_projects')}
          </h1>
        </div>
        <Button type="button" variant="default" size="sm" onClick={onCreate} className="shrink-0">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {localize('com_ui_new_project')}
        </Button>
      </div>
    </header>
  );
}
