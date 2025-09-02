import { TooltipAnchor, Button } from '~/components/ui';
import { Sidebar } from '~/components/svg';
import { useLocalize } from '~/hooks';

export default function OpenSidebar({
  setNavVisible,
}: {
  setNavVisible: React.Dispatch<React.SetStateAction<boolean>>;
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
          className="rounded-xl border border-border-light bg-surface-secondary p-2 hover:bg-surface-hover max-md:hidden"
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
