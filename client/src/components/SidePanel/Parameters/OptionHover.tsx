import React from 'react';
import { HoverCardPortal, HoverCardContent } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { ESide } from '~/common';

type TOptionHoverProps = {
  description: string;
  langCode?: boolean;
  sideOffset?: number;
  side: ESide;
};

function OptionHover({ side, description, langCode, sideOffset = 30 }: TOptionHoverProps) {
  const localize = useLocalize();
  const text = langCode ? localize(description) : description;
  return (
    <HoverCardPortal>
      <HoverCardContent
        side={side}
        className="z-[999] w-80 dark:bg-gray-700"
        sideOffset={sideOffset}
      >
        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">{text}</p>
        </div>
      </HoverCardContent>
    </HoverCardPortal>
  );
}

export default OptionHover;
