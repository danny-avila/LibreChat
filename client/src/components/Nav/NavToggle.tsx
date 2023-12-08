import { TooltipTrigger, TooltipContent } from '~/components/ui';
import { useLocalize, useLocalStorage } from '~/hooks';
import { cn } from '~/utils';

export default function NavToggle({ onToggle, navVisible, isHovering, setIsHovering }) {
  const localize = useLocalize();
  const transition = {
    transition: 'transform 0.3s ease, opacity 0.2s ease',
  };
  const [newUser, setNewUser] = useLocalStorage('newUser', true);

  return (
    <div
      className={cn(
        'fixed left-0 top-1/2 z-40 -translate-y-1/2 transition-transform',
        navVisible ? 'translate-x-[260px] rotate-0' : 'translate-x-0 rotate-180',
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <TooltipTrigger asChild>
        <button onClick={onToggle}>
          <span className="" data-state="closed">
            <div
              className="flex h-[72px] w-8 items-center justify-center"
              style={{ ...transition, opacity: isHovering ? 1 : 0.25 }}
            >
              <div className="flex h-6 w-6 flex-col items-center">
                <div
                  className="h-3 w-1 rounded-full bg-black dark:bg-white"
                  style={{
                    ...transition,
                    transform: `translateY(0.15rem) rotate(${
                      isHovering || !navVisible ? '15' : '0'
                    }deg) translateZ(0px)`,
                  }}
                />
                <div
                  className="h-3 w-1 rounded-full bg-black dark:bg-white"
                  style={{
                    ...transition,
                    transform: `translateY(-0.15rem) rotate(-${
                      isHovering || !navVisible ? '15' : '0'
                    }deg) translateZ(0px)`,
                  }}
                />
              </div>
            </div>
            <TooltipContent forceMount={newUser ? true : undefined} side="right" sideOffset={4}>
              {navVisible ? localize('com_nav_close_sidebar') : localize('com_nav_open_sidebar')}
            </TooltipContent>
          </span>
        </button>
      </TooltipTrigger>
    </div>
  );
}
