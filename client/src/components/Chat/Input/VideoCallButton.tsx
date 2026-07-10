import React, { forwardRef } from 'react';
import { Radio } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type VideoCallButtonProps = {
  disabled: boolean;
  onClick: () => void;
  isSubmitting?: boolean;
};

const VideoCallButton = React.memo(
  forwardRef((props: VideoCallButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const localize = useLocalize();
    return (
      <TooltipAnchor
        description={localize('com_nav_video_call') || 'Video Call'}
        render={
          <button
            ref={ref}
            aria-label={localize('com_nav_video_call') || 'Video Call'}
            id="video-call-button"
            disabled={props.disabled || props.isSubmitting}
            onClick={(e) => {
              e.preventDefault();
              props.onClick();
            }}
            className={cn(
              'rounded-full bg-transparent p-2 text-text-primary outline-offset-4 transition-all duration-200 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-10',
            )}
            type="button"
          >
            <Radio size={20} />
          </button>
        }
      />
    );
  }),
);

export default VideoCallButton;
