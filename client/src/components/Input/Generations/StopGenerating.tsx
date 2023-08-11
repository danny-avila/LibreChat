import { StopGeneratingIcon } from '~/components/svg';
import { useMessageHandler } from '~/hooks';
import Button from './Button';

export default function StopGenerating() {
  const { handleStopGenerating } = useMessageHandler();

  return (
    <Button onClick={handleStopGenerating}>
      <StopGeneratingIcon className="text-gray-600/90" />
      Stop generating
    </Button>
  );
}
