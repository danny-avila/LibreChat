import { useCallback } from 'react';
import { useSetRecoilState } from 'recoil';
import { useLocalize, useCustomLink } from '~/hooks';
import { buttonVariants } from '~/components/ui';
import { cn } from '~/utils';
import store from '~/store';

export default function ManagePrompts({ className }: { className?: string }) {
  const localize = useLocalize();
  const setPromptsName = useSetRecoilState(store.promptsName);
  const setPromptsCategory = useSetRecoilState(store.promptsCategory);
  const clickCallback = useCallback(() => {
    setPromptsName('');
    setPromptsCategory('');
  }, [setPromptsName, setPromptsCategory]);

  const clickHandler = useCustomLink('/d/prompts', clickCallback);
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
