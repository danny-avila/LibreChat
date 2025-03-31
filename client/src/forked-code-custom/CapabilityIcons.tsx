import React, { memo } from 'react';
import { Brain, ImageUp, Globe, FlaskConical, Microscope } from 'lucide-react';
import { TooltipAnchor } from '~/components/ui/Tooltip';
import { cn } from '~/utils';

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

/**
 * Memoized CapabilityIcon component to reduce re-renders
 */
export const CapabilityIcon = memo(({ type }: { type: string }) => {
  let iconElement;
  let bg;
  let ring;
  
  switch (type) {
    case 'reasoning':
      iconElement = <Brain className="h-3.5 w-3.5 text-pink-300" />;
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
});

/**
 * Memoized component for rendering a list of capability icons
 */
export const CapabilityIcons = memo(({ capabilities }: { capabilities?: string[] }) => {
  if (!capabilities || capabilities.length === 0) {
    return null;
  }
  
  return (
    <>
      {capabilities.map((capability: string, index: number) => (
        <CapabilityIcon key={index} type={capability} />
      ))}
    </>
  );
}); 