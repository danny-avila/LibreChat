import { useLocalize } from '~/hooks';
import { TooltipAnchor } from '~/components/ui';
import { cn } from '~/utils';

export default function NavToggle({
  onToggle,
  navVisible,
  isHovering,
  setIsHovering,
  side = 'left',
  className = '',
  translateX = true,
}) {
  const localize = useLocalize();
  const transition = {
    transition: 'transform 0.3s ease, opacity 0.2s ease',
  };

  const rotationDegree = 15;
  const rotation = isHovering || !navVisible ? `${rotationDegree}deg` : '0deg';
  const topBarRotation = side === 'right' ? `-${rotation}` : rotation;
  const bottomBarRotation = side === 'right' ? rotation : `-${rotation}`;

  return (
    <div
      className={cn(
        className,
        '-translate-y-1/2 transition-transform',
        navVisible ? 'rotate-0' : 'rotate-180',
        navVisible && translateX ? 'translate-x-[260px]' : 'translate-x-0 ',
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <TooltipAnchor
        side={side === 'right' ? 'left' : 'right'}
        aria-label={side === 'left' ? localize('com_ui_chat_history') : localize('com_ui_controls')}
        aria-expanded={navVisible}
        aria-controls={side === 'left' ? 'chat-history-nav' : 'controls-nav'}
        id={`toggle-${side}-nav`}
        onClick={onToggle}
        role="button"
        description={
          navVisible ? localize('com_nav_close_sidebar') : localize('com_nav_open_sidebar')
        }
        className="flex items-center justify-center"
        tabIndex={0}
      >
        <span className="" data-state="closed">
          <div
            className="flex h-[72px] w-8 items-center justify-center"
            style={{ ...transition, opacity: isHovering ? 1 : 0.25 }}
          >
            <div className="flex h-6 w-6 flex-col items-center">
              {/* Top bar */}
              <div
                className="h-3 w-1 rounded-full bg-black dark:bg-white"
                style={{
                  ...transition,
                  transform: `translateY(0.15rem) rotate(${topBarRotation}) translateZ(0px)`,
                }}
              />
              {/* Bottom bar */}
              <div
                className="h-3 w-1 rounded-full bg-black dark:bg-white"
                style={{
                  ...transition,
                  transform: `translateY(-0.15rem) rotate(${bottomBarRotation}) translateZ(0px)`,
                }}
              />
            </div>
          </div>
        </span>
      </TooltipAnchor>
    </div>
  );
}
