import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { buttonVariants } from '@librechat/client';
import { useDashboardContext } from '~/Providers';
import { useLocalize, useCustomLink } from '~/hooks';
import { cn } from '~/utils';

export default function BackToChat({ className }: { className?: string }) {
  const localize = useLocalize();
  const { prevLocationPath } = useDashboardContext();

  const conversationId = useMemo(() => {
    if (!prevLocationPath || prevLocationPath.includes('/d/')) {
      return 'new';
    }
    const parts = prevLocationPath.split('/');
    return parts[parts.length - 1];
  }, [prevLocationPath]);

  const href = `/c/${conversationId}`;
  const clickHandler = useCustomLink(href);

  return (
    <a
      className={cn(buttonVariants({ variant: 'outline' }), className)}
      href={href}
      onClick={clickHandler}
    >
      <ArrowLeft className="icon-xs mr-2" aria-hidden="true" />
      {localize('com_ui_back_to_chat')}
    </a>
  );
}
