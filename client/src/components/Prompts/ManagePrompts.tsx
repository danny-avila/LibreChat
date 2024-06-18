import { buttonVariants } from '~/components/ui';
import { useLocalize, useCustomLink } from '~/hooks';
import { cn } from '~/utils';

export default function ManagePrompts({ className }: { className?: string }) {
  const localize = useLocalize();
  const clickHandler = useCustomLink('/d/prompts');
  return (
    <a
      className={cn(buttonVariants({ variant: 'outline' }), className)}
      href="/d/prompts"
      onClick={clickHandler}
    >
      {localize('com_ui_manage')}
    </a>
  );
}
