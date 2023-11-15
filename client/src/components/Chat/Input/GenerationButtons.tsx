import { useEffect, useState } from 'react';
import type { TMessage } from 'librechat-data-provider';
import { useMediaQuery, useGenerationsByLatest } from '~/hooks';
import Regenerate from '~/components/Input/Generations/Regenerate';
import Continue from '~/components/Input/Generations/Continue';
import Stop from '~/components/Input/Generations/Stop';
import { useChatContext } from '~/Providers';
import { cn } from '~/utils';

type GenerationButtonsProps = {
  endpoint: string;
  showPopover?: boolean;
  opacityClass?: string;
};

export default function GenerationButtons({
  endpoint,
  showPopover = false,
  opacityClass = 'full-opacity',
}: GenerationButtonsProps) {
  const {
    getMessages,
    isSubmitting,
    latestMessage,
    handleContinue,
    handleRegenerate,
    handleStopGenerating,
  } = useChatContext();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { continueSupported, regenerateEnabled } = useGenerationsByLatest({
    endpoint,
    message: latestMessage as TMessage,
    isSubmitting,
    latestMessage,
  });

  const [userStopped, setUserStopped] = useState(false);
  const messages = getMessages();

  const handleStop = (e: React.MouseEvent<HTMLButtonElement>) => {
    setUserStopped(true);
    handleStopGenerating(e);
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (userStopped) {
      timer = setTimeout(() => {
        setUserStopped(false);
      }, 200);
    }

    return () => {
      clearTimeout(timer);
    };
  }, [userStopped]);

  if (isSmallScreen) {
    return null;
  }

  let button: React.ReactNode = null;

  if (isSubmitting) {
    button = <Stop onClick={handleStop} />;
  } else if (userStopped || continueSupported) {
    button = <Continue onClick={handleContinue} />;
  } else if (messages && messages.length > 0 && regenerateEnabled) {
    button = <Regenerate onClick={handleRegenerate} />;
  }

  return (
    <div className="absolute bottom-0 right-0 z-[62]">
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
