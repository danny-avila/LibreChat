import { TooltipAnchor, Button } from '~/components/ui';
import { Sidebar } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function OpenSidebar({
  setNavVisible,
  className,
}: {
  setNavVisible: React.Dispatch<React.SetStateAction<boolean>>;
  className?: string;
}) {
  const localize = useLocalize();
  return (
    <TooltipAnchor
      description={localize('com_nav_open_sidebar')}
      render={
        <Button
          size="icon"
          variant="outline"
          data-testid="open-sidebar-button"
          aria-label={localize('com_nav_open_sidebar')}
          className={cn(
            'rounded-xl border border-border-light bg-surface-secondary p-2 hover:bg-surface-hover',
            className,
          )}
          onClick={() =>
            setNavVisible((prev) => {
              localStorage.setItem('navVisible', JSON.stringify(!prev));
              return !prev;
            })
          }
        >
          <Sidebar />
        </Button>
      }
    />
  );
}
