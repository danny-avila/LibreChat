import type { TGenButtonProps } from '~/common';
import { ContinueIcon } from '~/components/svg';
import Button from './Button';

export default function Continue({ onClick }: TGenButtonProps) {
  return (
    <Button type="continue" onClick={onClick}>
      <ContinueIcon className="text-gray-600/90 dark:text-gray-400 " />
      Continue
    </Button>
  );
}
