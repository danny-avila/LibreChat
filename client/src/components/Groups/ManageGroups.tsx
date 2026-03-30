import { useCallback } from 'react';
import { Button } from '@librechat/client';
import { useLocalize, useCustomLink } from '~/hooks';
import { cn } from '~/utils';

export default function ManageGroups({ className }: { className?: string }) {
  const localize = useLocalize();
  
  const customLink = useCustomLink('/d/groups');
  const clickHandler = (e: React.MouseEvent<HTMLButtonElement>) => {
    customLink(e as unknown as React.MouseEvent<HTMLAnchorElement>);
  };

  return (
    <Button
      variant="outline"
      className={cn(className, 'bg-transparent')}
      onClick={clickHandler}
      aria-label="Manage Groups"
      role="button"
    >
      {localize('com_ui_manage')} Groups
    </Button>
  );
}