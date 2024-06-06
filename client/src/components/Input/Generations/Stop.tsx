import type { TGenButtonProps } from '~/common';
import { StopGeneratingIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import Button from './Button';

export default function Stop({ onClick }: TGenButtonProps) {
  const localize = useLocalize();

  return (
    <Button type="stop" onClick={onClick}>
      <StopGeneratingIcon className="text-gray-600/90 dark:text-gray-400 " />
      {localize('com_ui_stop')}
    </Button>
  );
}
