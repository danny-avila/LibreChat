import { useRecoilState } from 'recoil';
import { Switch } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

export default function AlwaysMakeProd({
  onCheckedChange,
  className = '',
}: {
  onCheckedChange?: (value: boolean) => void;
  className?: string;
}) {
  const [alwaysMakeProd, setAlwaysMakeProd] = useRecoilState<boolean>(store.alwaysMakeProd);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setAlwaysMakeProd(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <div className={cn('flex select-none items-center justify-end gap-2 text-xs', className)}>
      <Switch
        id="alwaysMakeProd"
        checked={alwaysMakeProd}
        onCheckedChange={handleCheckedChange}
        data-testid="alwaysMakeProd"
        aria-label={localize('com_nav_always_make_prod')}
      />
      <div>{localize('com_nav_always_make_prod')} </div>
    </div>
  );
}
