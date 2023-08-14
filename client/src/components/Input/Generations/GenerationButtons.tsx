import { cn } from '~/utils';
import { useMessageHandler, useMediaQuery } from '~/hooks';
import Regenerate from './Regenerate';
import Continue from './Continue';
import Stop from './Stop';

type GenerationButtonsProps = {
  showPopover: boolean;
  opacityClass: string;
};

export default function GenerationButtons({ showPopover, opacityClass }: GenerationButtonsProps) {
  const {
    messages,
    isSubmitting,
    latestMessage,
    handleContinue,
    handleRegenerate,
    handleStopGenerating,
  } = useMessageHandler();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  if (isSmallScreen) {
    return null;
  }

  let button: React.ReactNode = null;
  const { finish_reason } = latestMessage || {};

  if (isSubmitting) {
    button = <Stop onClick={handleStopGenerating} />;
  } else if (finish_reason && finish_reason !== 'stop') {
    button = <Continue onClick={handleContinue} />;
  } else if (messages && messages.length > 0) {
    button = <Regenerate onClick={handleRegenerate} />;
  }

  return (
    <div className="absolute bottom-4 right-0 z-[62]">
      <div className="grow" />
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
