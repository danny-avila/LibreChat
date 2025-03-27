import React from 'react';
import type { TModelSpec } from 'librechat-data-provider';
import { CustomMenuItem as MenuItem } from '../CustomMenu';
import { useModelSelectorContext } from '../ModelSelectorContext';
import SpecIcon from './SpecIcon';
import { cn } from '~/utils';
import { Brain, Eye } from 'lucide-react';

interface ModelSpecItemProps {
  spec: TModelSpec;
  isSelected: boolean;
}

const CapabilityIcon = ({ type }: { type: string }) => {
  let iconElement;
  let bgColor;
  
  switch (type) {
    case 'reasoning':
      iconElement = <Brain className="h-4 w-4" />;
      bgColor = 'hsl(263 58% 75%)';
      break;
    case 'upload_image':
      iconElement = <Eye className="h-4 w-4" />;
      bgColor = 'hsl(168 54% 52%)';
      break;
    default:
      return null;
  }
  
  return (
    <div 
      className="flex items-center justify-center"
      style={{
        width: '24px',
        height: '24px',
        backgroundColor: bgColor,
        opacity: 0.15,
        borderRadius: 'calc(0.5rem - 2px)',
        position: 'relative'
      }}
    >
      <div 
        style={{ 
          position: 'absolute',
          display: 'flex',
          color: bgColor,
          opacity: 1
        }}
      >
        {iconElement}
      </div>
    </div>
  );
};

export function ModelSpecItem({ spec, isSelected }: ModelSpecItemProps) {
  const { handleSelectSpec, endpointsConfig } = useModelSelectorContext();
  const { showIconInMenu = true } = spec;
  return (
    <MenuItem
      key={spec.name}
      onClick={() => handleSelectSpec(spec)}
      className={cn(
        'flex w-full cursor-pointer items-center justify-between rounded-lg px-2 text-sm',
      )}
    >
      <div
        className={cn(
          'flex w-full min-w-0 gap-2 px-1 py-1',
          spec.description ? 'items-start' : 'items-center',
        )}
      >
        {showIconInMenu && (
          <div className="flex-shrink-0">
            <SpecIcon currentSpec={spec} endpointsConfig={endpointsConfig} />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1 w-full">
          <div className="flex items-center justify-between w-full">
            <span className="truncate text-left">{spec.label}</span>
            {spec.iconCapabilities && spec.iconCapabilities.length > 0 && (
              <div className="flex gap-1 flex-shrink-0">
                {spec.iconCapabilities.map((capability: string, index: number) => (
                  <CapabilityIcon key={index} type={capability} />
                ))}
              </div>
            )}
          </div>
          {spec.description && (
            <span className="break-words text-xs font-normal">{spec.description}</span>
          )}
        </div>
      </div>
      {isSelected && (
        <div className="flex-shrink-0 self-center">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="block"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.0755 7.93219C16.5272 8.25003 16.6356 8.87383 16.3178 9.32549L11.5678 16.0755C11.3931 16.3237 11.1152 16.4792 10.8123 16.4981C10.5093 16.517 10.2142 16.3973 10.0101 16.1727L7.51006 13.4227C7.13855 13.014 7.16867 12.3816 7.57733 12.0101C7.98598 11.6386 8.61843 11.6687 8.98994 12.0773L10.6504 13.9039L14.6822 8.17451C15 7.72284 15.6238 7.61436 16.0755 7.93219Z"
              fill="currentColor"
            />
          </svg>
        </div>
      )}
    </MenuItem>
  );
}

export function renderModelSpecs(specs: TModelSpec[], selectedSpec: string) {
  if (!specs || specs.length === 0) {
    return null;
  }

  return specs.map((spec) => (
    <ModelSpecItem key={spec.name} spec={spec} isSelected={selectedSpec === spec.name} />
  ));
}
