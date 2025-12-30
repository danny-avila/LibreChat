import { useState } from 'react';
import { CircleHelpIcon } from 'lucide-react';
import { HoverCard, HoverCardTrigger, HoverCardPortal, HoverCardContent } from './HoverCard';
import { ESide } from '~/common';

type InfoHoverCardProps = {
  side?: ESide;
  text: string;
};

const InfoHoverCard = ({ side, text }: InfoHoverCardProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <HoverCard openDelay={50} open={isOpen} onOpenChange={setIsOpen}>
      <HoverCardTrigger
        tabIndex={0}
        className="inline-flex cursor-help items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary focus-visible:ring-offset-2"
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        aria-label={text}
      >
        <CircleHelpIcon className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent side={side} className="z-[999] w-80">
          <div className="max-h-[80vh] space-y-2 overflow-y-auto">
            <span className="text-sm text-text-secondary">{text}</span>
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
};

export default InfoHoverCard;
