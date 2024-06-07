import type { TGenButtonProps } from '~/common';
import { ContinueIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import Button from './Button';

export default function Continue({ onClick }: TGenButtonProps) {
  const localize = useLocalize();

  return (
    <Button type="continue" onClick={onClick}>
      <ContinueIcon className="text-gray-600/90 dark:text-gray-400 " />
      {localize('com_ui_continue')}
    </Button>
  );
}
