import { cn } from '~/utils';
import { useMessageHandler } from '~/hooks';
import StopGenerating from './StopGenerating';
import Regenerate from './Regenerate';

type GenerationButtonsProps = {
  showPopover: boolean;
  opacityClass: string;
};

export default function GenerationButtons({ showPopover, opacityClass }: GenerationButtonsProps) {
  const { isSubmitting, messages } = useMessageHandler();

  let button: React.ReactNode = null;

  if (isSubmitting) {
    button = <StopGenerating />;
  } else if (messages && messages.length > 0) {
    button = <Regenerate />;
  }

  return (
    <div className="absolute bottom-4 right-0 z-[62]">
      <div className="grow"></div>
      <div className="flex items-center md:items-end">
        <div
          className={cn('option-buttons', showPopover ? '' : opacityClass)}
          data-projection-id="173"
        >
          {button}
        </div>
      </div>
    </div>
  );
}
