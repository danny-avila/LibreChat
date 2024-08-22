import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Trigger } from '@radix-ui/react-popover';

export default function TitleButton({ primaryText = '', secondaryText = '' }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Trigger asChild>
      <button
        className="group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-lg font-medium transition-colors duration-200 hover:bg-surface-hover radix-state-open:bg-surface-hover"
        aria-label={`Select ${primaryText}`}
        aria-haspopup="dialog"
        aria-expanded={isExpanded}
        aria-controls="radix-:r6:"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div>
          <span className="text-token-text-secondary"> {primaryText} </span>
          {!!secondaryText && <span className="text-token-text-secondary">{secondaryText}</span>}
        </div>
        <ChevronDown className="text-token-text-secondary size-4" />
      </button>
    </Trigger>
  );
}
