import { RegenerateIcon } from '~/components/svg';
import { useMessageHandler } from '~/hooks';
import Button from './Button';

export default function StopGenerating() {
  const { handleRegenerate } = useMessageHandler();

  return (
    <Button onClick={handleRegenerate}>
      <RegenerateIcon className="h-3 w-3 flex-shrink-0 text-gray-600/90" />
      Regenerate
    </Button>
  );
}
