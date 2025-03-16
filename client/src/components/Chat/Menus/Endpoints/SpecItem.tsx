import React from 'react';
import type { TModelSpec, TEndpointsConfig } from 'librechat-data-provider';
import SpecIcon from './SpecIcon';
import { Label } from '~/components/ui';

interface SpecItemProps {
  spec: TModelSpec;
  isSelected: boolean;
  endpointsConfig: TEndpointsConfig;
  onSelect: (spec: TModelSpec) => void;
}

const SpecItem: React.FC<SpecItemProps> = ({ spec, isSelected, endpointsConfig, onSelect }) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(spec);
    }
  };

  const handleClick = () => {
    onSelect(spec);
  };

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="option"
      tabIndex={0}
      aria-selected={isSelected}
      className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-text-primary transition-colors duration-75 hover:bg-surface-tertiary focus:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <div className="flex max-w-[25vw] items-start overflow-hidden">
        {spec.showIconInMenu !== false && (
          <div className="mr-2 flex">
            <SpecIcon currentSpec={spec} endpointsConfig={endpointsConfig} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1">
            <span className="block truncate text-lg font-semibold text-text-primary">
              {spec.label}
            </span>
            {spec.description && (
              <Label className="break-words font-normal text-text-secondary">
                {spec.description}
              </Label>
            )}
          </div>
        </div>
      </div>
      <div className="ml-2 flex shrink-0 items-center">
        {isSelected && (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="icon-md block"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z"
              fill="currentColor"
            />
          </svg>
        )}
      </div>
    </div>
  );
};

export default React.memo(SpecItem);
