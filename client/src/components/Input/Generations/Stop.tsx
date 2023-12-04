import type { TGenButtonProps } from '~/common';
import { StopGeneratingIcon } from '~/components/svg';
import Button from './Button';
import { useLocalize } from '~/hooks';

export default function Stop({ onClick }: TGenButtonProps) {
  const localize = useLocalize();

  return (
    <Button type="stop" onClick={onClick}>
      <StopGeneratingIcon className="text-gray-600/90 dark:text-gray-400 " />
	  {localize('com_ui_stop')}
    </Button>
  );
}
