import type { TGenButtonProps } from '~/common';
import { RegenerateIcon } from '~/components/svg';
import Button from './Button';

export default function Regenerate({ onClick }: TGenButtonProps) {
  return (
    <Button onClick={onClick}>
      <RegenerateIcon className="h-3 w-3 flex-shrink-0 text-gray-600/90 dark:text-gray-400" />
      Regenerate
    </Button>
  );
}
