import { UserRound } from 'lucide-react';
import { Button, TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MineFilterToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const MineFilterToggle: React.FC<MineFilterToggleProps> = ({ checked, onCheckedChange }) => {
  const localize = useLocalize();

  return (
    <TooltipAnchor
      description={localize('com_agents_filter_mine')}
      render={
        <Button
          variant="outline"
          aria-label={localize('com_agents_my_agents')}
          size="sm"
          aria-pressed={checked}
          onClick={() => onCheckedChange(!checked)}
          className={cn(
            'h-8 gap-1.5 px-2.5 text-xs transition-none',
            checked && 'border-border-heavy bg-surface-active-alt hover:bg-surface-active-alt',
          )}
        >
          <UserRound className="size-3.5" aria-hidden="true" />
          {localize('com_agents_my_agents')}
        </Button>
      }
    />
  );
};

export default MineFilterToggle;
