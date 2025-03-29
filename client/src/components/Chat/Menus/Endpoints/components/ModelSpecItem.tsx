import React from 'react';
import type { TModelSpec } from 'librechat-data-provider';
import { CustomMenuItem as MenuItem } from '../CustomMenu';
import { useModelSelectorContext } from '../ModelSelectorContext';
import SpecIcon from './SpecIcon';
import { cn } from '~/utils';
import { BrainCircuit, ImageUp, Globe, FlaskConical, Microscope } from 'lucide-react';
import { TooltipAnchor } from '~/components/ui/Tooltip';

interface ModelSpecItemProps {
  spec: TModelSpec;
  isSelected: boolean;
}

const getCapabilityDescription = (type: string): string => {
  switch (type) {
    case 'reasoning':
      return 'Has reasoning capabilities';
    case 'upload_image':
      return 'Supports image uploads';
    case 'web_search':
      return 'Uses web search to answer questions';
    case 'experimental':
      return 'Experimental model';
    case 'deep_research':
      return 'Performs deep research and analysis';
    default:
      return '';
  }
};

const CapabilityIcon = ({ type }: { type: string }) => {
  let iconElement;
  let bg;
  let ring;
  
  switch (type) {
    case 'reasoning':
      iconElement = <BrainCircuit className="h-3.5 w-3.5 text-pink-300" />;
      bg = 'bg-gradient-to-br from-pink-900/20 to-pink-800/10';
      ring = 'ring-1 ring-inset ring-pink-300/30';
      break;
    case 'upload_image':
      iconElement = <ImageUp className="h-3.5 w-3.5 text-cyan-300" />;
      bg = 'bg-gradient-to-br from-cyan-900/20 to-cyan-800/10';
      ring = 'ring-1 ring-inset ring-cyan-300/30';
      break;
    case 'web_search':
      iconElement = <Globe className="h-3.5 w-3.5 text-white" />;
      bg = 'bg-gradient-to-br from-white/10 to-white/5';
      ring = 'ring-1 ring-inset ring-white/20';
      break;
    case 'experimental':
      iconElement = <FlaskConical className="h-3.5 w-3.5 text-emerald-300" />;
      bg = 'bg-gradient-to-br from-emerald-900/20 to-emerald-800/10';
      ring = 'ring-1 ring-inset ring-emerald-300/30';
      break;
    case 'deep_research':
      iconElement = <Microscope className="h-3.5 w-3.5 text-purple-300" />;
      bg = 'bg-gradient-to-br from-purple-900/20 to-purple-800/10';
      ring = 'ring-1 ring-inset ring-purple-300/30';
      break;
    default:
      return null;
  }
  
  const description = getCapabilityDescription(type);
  
  return (
    <TooltipAnchor
      description={description}
      side="top"
      className="cursor-pointer flex items-center justify-center"
    >
      <div 
        className={cn(
          'relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-full backdrop-blur-sm bg-opacity-80',
          bg,
          ring
        )}
      >
        {iconElement}
      </div>
    </TooltipAnchor>
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
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-left">{spec.label}</span>
          {spec.description && (
            <span className="break-words text-xs font-normal">{spec.description}</span>
          )}
          {/* <div className="flex items-center gap-2 mt-1">
            <div 
              className="flex items-center gap-1 px-2.5 py-0.75 bg-gradient-to-r from-blue-900/30 to-blue-800/20 rounded-full" 
              style={{ border: '0.5px solid rgb(147, 197, 253)' }}
            >
              <span 
                className="text-[10px] font-semibold" 
                style={{ color: 'rgb(147, 197, 253)' }}
              >
                IN $0.15/1M
              </span>
            </div>
            <div 
              className="flex items-center gap-1 px-2.5 py-0.75 bg-gradient-to-r from-purple-900/30 to-purple-800/20 rounded-full" 
              style={{ border: '0.5px solid rgb(216, 180, 254)' }}
            >
              <span 
                className="text-[10px] font-semibold" 
                style={{ color: 'rgb(216, 180, 254)' }}
              >
                OUT $0.60/1M
              </span>
            </div>
          </div> */}
        </div>
      </div>

      {/* Wrapper for capability icons and selected checkmark, aligned to top */}
      <div className="flex gap-2 flex-shrink-0 py-1" style={{ alignSelf: 'flex-start', marginRight: isSelected ? '0' : '24px' }}>
        {spec.iconCapabilities && spec.iconCapabilities.length > 0 && (
          spec.iconCapabilities.map((capability: string, index: number) => (
            <CapabilityIcon key={index} type={capability} />
          ))
        )}
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
