import React, { useState, useEffect, useCallback } from 'react';
import { StopGeneratingIcon } from '~/components';
import { Settings } from 'lucide-react';
import { SetKeyDialog } from './SetKeyDialog';
import { useUserKey, useLocalize, useMediaQuery } from '~/hooks';
import { SendMessageIcon } from '~/components/svg';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/';

export default function SubmitButton({
  conversation,
  submitMessage,
  handleStopGenerating,
  disabled,
  isSubmitting,
  userProvidesKey,
  hasText,
}) {
  const { endpoint } = conversation;
  const [isDialogOpen, setDialogOpen] = useState(false);
  const { checkExpiry } = useUserKey(endpoint);
  const [isKeyProvided, setKeyProvided] = useState(userProvidesKey ? checkExpiry() : true);
  const isKeyActive = checkExpiry();
  const localize = useLocalize();
  const dots = ['·', '··', '···'];
  const [dotIndex, setDotIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDotIndex((prevDotIndex) => (prevDotIndex + 1) % dots.length);
    }, 500);

    return () => clearInterval(interval);
  }, [dots.length]);

  useEffect(() => {
    if (userProvidesKey) {
      setKeyProvided(isKeyActive);
    } else {
      setKeyProvided(true);
    }
  }, [checkExpiry, endpoint, userProvidesKey, isKeyActive]);

  const clickHandler = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      submitMessage();
    },
    [submitMessage],
  );

  const [isSquareGreen, setIsSquareGreen] = useState(false);

  const setKey = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const iconContainerClass = `m-1 mr-0 rounded-md pb-[5px] pl-[6px] pr-[4px] pt-[5px] ${
    hasText ? (isSquareGreen ? 'bg-green-500' : '') : ''
  } group-hover:bg-19C37D group-disabled:hover:bg-transparent dark:${
    hasText ? (isSquareGreen ? 'bg-green-500' : '') : ''
  } dark:group-hover:text-gray-400 dark:group-disabled:hover:bg-transparent`;

  useEffect(() => {
    setIsSquareGreen(hasText);
  }, [hasText]);

  if (isSubmitting && isSmallScreen) {
    return (
      <button onClick={handleStopGenerating} type="button">
        <div className="m-1 mr-0 rounded-md p-2 pb-[10px] pt-[10px] group-hover:bg-gray-100 group-disabled:hover:bg-transparent dark:group-hover:bg-gray-900 dark:group-hover:text-gray-400 dark:group-disabled:hover:bg-transparent">
          <StopGeneratingIcon />
        </div>
      </button>
    );
  } else if (isSubmitting) {
    return (
      <div className="relative flex h-full">
        <div
          className="absolute text-2xl"
          style={{ top: '50%', transform: 'translateY(-20%) translateX(-33px)' }}
        >
          {dots[dotIndex]}
        </div>
      </div>
    );
  } else if (!isKeyProvided) {
    return (
      <>
        <button
          onClick={setKey}
          type="button"
          className="group absolute bottom-0 right-0 z-[101] flex h-[100%] w-auto items-center justify-center bg-transparent pr-1 text-gray-500"
        >
          <div className="flex items-center justify-center rounded-md text-xs group-hover:bg-gray-100 group-disabled:hover:bg-transparent dark:group-hover:bg-gray-900 dark:group-hover:text-gray-400 dark:group-disabled:hover:bg-transparent">
            <div className="m-0 mr-0 flex items-center justify-center rounded-md p-2 sm:p-2">
              <Settings className="mr-1 inline-block h-auto w-[18px]" />
              {localize('com_endpoint_config_key_name_placeholder')}
            </div>
          </div>
        </button>
        {userProvidesKey && (
          <SetKeyDialog open={isDialogOpen} onOpenChange={setDialogOpen} endpoint={endpoint} />
        )}
      </>
    );
  } else {
    return (
      <TooltipProvider delayDuration={50}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={clickHandler}
              disabled={disabled}
              data-testid="submit-button"
              className="group absolute bottom-0 right-0 z-[101] flex h-[100%] w-[50px] items-center justify-center bg-transparent p-1 text-gray-500"
            >
              <div className={iconContainerClass}>
                {hasText ? (
                  <div className="bg-19C37D flex h-[24px] w-[24px] items-center justify-center rounded-full text-white">
                    <SendMessageIcon />
                  </div>
                ) : (
                  <SendMessageIcon />
                )}
              </div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={-5}>
            {localize('com_nav_send_message')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
}
