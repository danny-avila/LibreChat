import React from 'react';
import { HoverCardPortal, HoverCardContent } from '~/components/ui';
import { TranslationKeys, useLocalize } from '~/hooks';
import { ESide } from '~/common';

type TOptionHoverProps = {
  description: string;
  langCode?: boolean;
  sideOffset?: number;
  disabled?: boolean;
  side: ESide;
  className?: string;
};

function OptionHover({
  side,
  description,
  disabled,
  langCode,
  sideOffset = 30,
  className,
}: TOptionHoverProps) {
  const localize = useLocalize();
  if (disabled) {
    return null;
  }
  const text = langCode ? localize(description as TranslationKeys) : description;
  return (
    <HoverCardPortal>
      <HoverCardContent side={side} className={`z-[999] w-80 ${className}`} sideOffset={sideOffset}>
        <div className="space-y-2">
          <p className="whitespace-pre-wrap text-sm text-text-secondary">{text}</p>
        </div>
      </HoverCardContent>
    </HoverCardPortal>
  );
}

export default OptionHover;
