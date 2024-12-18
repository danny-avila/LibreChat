import { useState } from 'react';
import { Trigger } from '@radix-ui/react-popover';
import type { TModelSpec, TEndpointsConfig } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import SpecIcon from './SpecIcon';
import { cn } from '~/utils';

export default function MenuButton({
  selected,
  className = '',
  textClassName = '',
  primaryText = '',
  secondaryText = '',
  endpointsConfig,
}: {
  selected?: TModelSpec;
  className?: string;
  textClassName?: string;
  primaryText?: string;
  secondaryText?: string;
  endpointsConfig: TEndpointsConfig;
}) {
  const localize = useLocalize();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Trigger asChild>
      <button
        className={cn(
          'group flex cursor-pointer items-center gap-1 rounded-xl px-3 py-2 text-lg font-medium hover:bg-gray-50 radix-state-open:bg-gray-50 dark:hover:bg-gray-700 dark:radix-state-open:bg-gray-700',
          className,
        )}
        type="button"
        aria-label={localize('com_ui_llm_menu')}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isExpanded}
        aria-controls="llm-menu"
        aria-activedescendant={isExpanded ? 'selected-llm' : undefined}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {selected && selected.showIconInHeader === true && (
          <SpecIcon currentSpec={selected} endpointsConfig={endpointsConfig} />
        )}
        <div className={textClassName}>
          {!selected ? localize('com_ui_none_selected') : primaryText}{' '}
          {!!secondaryText && <span className="text-token-text-secondary">{secondaryText}</span>}
        </div>
        <svg
          width="16"
          height="17"
          viewBox="0 0 16 17"
          fill="none"
          className="text-token-text-tertiary"
        >
          <path
            d="M11.3346 7.83203L8.00131 11.1654L4.66797 7.83203"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </Trigger>
  );
}
