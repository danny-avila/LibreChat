import type { TGenButtonProps } from '~/common';
import { StopGeneratingIcon } from '~/components/svg';
import Button from './Button';

export default function Stop({ onClick }: TGenButtonProps) {
  return (
    <Button type="stop" onClick={onClick}>
      <StopGeneratingIcon className="text-gray-600/90" />
      Stop
    </Button>
  );
}
