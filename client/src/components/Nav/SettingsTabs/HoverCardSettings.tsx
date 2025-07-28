import React from 'react';
import {
  CircleHelpIcon,
  HoverCard,
  HoverCardTrigger,
  HoverCardPortal,
  HoverCardContent,
} from '@librechat/client';
import { useLocalize } from '~/hooks';

const HoverCardSettings = ({ side, text }) => {
  const localize = useLocalize();

  return (
    <HoverCard openDelay={500}>
      <HoverCardTrigger>
        <CircleHelpIcon className="h-5 w-5 text-text-tertiary" />{' '}
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent side={side} className="z-[999] w-80">
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">{localize(text)}</p>
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
};

export default HoverCardSettings;
