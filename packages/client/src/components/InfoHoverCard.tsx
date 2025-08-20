import { CircleHelpIcon } from 'lucide-react';
import { HoverCard, HoverCardTrigger, HoverCardPortal, HoverCardContent } from './HoverCard';
import { ESide } from '~/common';

type InfoHoverCardProps = {
  side?: ESide;
  text: string;
};

const InfoHoverCard = ({ side, text }: InfoHoverCardProps) => {
  return (
    <HoverCard openDelay={50}>
      <HoverCardTrigger className="cursor-help">
        <CircleHelpIcon className="h-5 w-5 text-text-tertiary" />{' '}
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent side={side} className="z-[999] w-80">
          <div className="space-y-2">
            <p className="text-sm text-text-secondary">{text}</p>
          </div>
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
};

export default InfoHoverCard;
