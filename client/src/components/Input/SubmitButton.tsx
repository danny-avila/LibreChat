import React, { useState, useEffect, useCallback } from 'react';
import { StopGeneratingIcon, ListeningIcon, Spinner, SendMessageIcon } from '~/components';
import { Settings } from 'lucide-react';
import { SetKeyDialog } from './SetKeyDialog';
import { useUserKey, useLocalize, useMediaQuery } from '~/hooks';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/';

export default function SubmitButton({
  conversation,
  submitMessage,
  handleStopGenerating,
  disabled,
  isSubmitting,
  userProvidesKey,
  hasText,
  isListening,
  isLoading,
}) {
  const { endpoint } = conversation;
  const [isDialogOpen, setDialogOpen] = useState(false);
  const { checkExpiry } = useUserKey(endpoint);
  const [isKeyProvided, setKeyProvided] = useState(userProvidesKey ? checkExpiry() : true);
  const isKeyActive = checkExpiry();
  const localize = useLocalize();
  const dots = ['·', '··', '···'];
  const [dotIndex, setDotIndex] = useState(0);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  const setKey = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const clickHandler = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      submitMessage();
    },
    [submitMessage],
  );

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

  if (isListening) {
    return (
      <button
        className="group absolute bottom-0 right-0 z-[101] flex h-[100%] w-[50px] items-center justify-center bg-transparent p-1 text-gray-500"
        disabled={true}
      >
        <span className="" data-state="closed">
          <ListeningIcon />
        </span>
      </button>
    );
  }

  if (isLoading) {
    return (
      <button
        className="group absolute bottom-0 right-0 z-[101] flex h-[100%] w-[50px] items-center justify-center bg-transparent p-1 text-gray-500"
        disabled={true}
      >
        <span className="" data-state="closed">
          <Spinner className="icon-sm m-auto text-white" />
        </span>
      </button>
    );
  }

  if (isSubmitting && isSmallScreen) {
    return (
      <button onClick={handleStopGenerating} type="button">
        <div className="m-1 mr-0 rounded-md p-2 pb-[10px] pt-[10px] group-hover:bg-gray-200 group-disabled:hover:bg-transparent dark:group-hover:bg-gray-800 dark:group-hover:text-gray-400 dark:group-disabled:hover:bg-transparent">
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
          <div className="flex items-center justify-center rounded-md text-xs group-hover:bg-gray-200 group-disabled:hover:bg-transparent dark:group-hover:bg-gray-800 dark:group-hover:text-gray-400 dark:group-disabled:hover:bg-transparent">
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
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={clickHandler}
              disabled={disabled}
              data-testid="submit-button"
              className="group absolute bottom-0 right-0 z-[101] flex h-[100%] w-[50px] items-center justify-center bg-transparent p-1 text-gray-500"
            >
              {hasText ? (
                <div className="bg-19C37D flex h-[24px] w-[24px] items-center justify-center rounded-full text-white">
                  <SendMessageIcon />
                </div>
              ) : (
                <SendMessageIcon />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={-5}>
            {localize('com_nav_send_message')}
          </TooltipContent>
        </Tooltip>
        {userProvidesKey && (
          <SetKeyDialog open={isDialogOpen} onOpenChange={setDialogOpen} endpoint={endpoint} />
        )}
      </TooltipProvider>
    );
  }
}
