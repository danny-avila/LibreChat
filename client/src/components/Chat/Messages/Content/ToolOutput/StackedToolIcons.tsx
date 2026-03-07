import { useMemo } from 'react';
import ToolIcon, { getToolIconType } from './ToolIcon';
import type { ToolIconType } from './ToolIcon';
import { cn } from '~/utils';

interface StackedToolIconsProps {
  toolNames: string[];
  maxIcons?: number;
  isAnimating?: boolean;
}

export default function StackedToolIcons({
  toolNames,
  maxIcons = 3,
  isAnimating = false,
}: StackedToolIconsProps) {
  const uniqueTypes = useMemo(() => {
    const seen = new Set<ToolIconType>();
    const result: ToolIconType[] = [];
    for (const name of toolNames) {
      const type = getToolIconType(name);
      if (!seen.has(type)) {
        seen.add(type);
        result.push(type);
      }
    }
    return result;
  }, [toolNames]);

  const visibleTypes = uniqueTypes.slice(0, maxIcons);
  const overflowCount = uniqueTypes.length - visibleTypes.length;

  if (visibleTypes.length <= 1) {
    return <ToolIcon type={visibleTypes[0] ?? 'generic'} isAnimating={isAnimating} />;
  }

  return (
    <div className="flex items-center" aria-hidden="true">
      {visibleTypes.map((type, index) => (
        <div
          key={type}
          className={cn(
            'relative flex items-center justify-center rounded-full border border-border-medium bg-surface-secondary',
            'h-[22px] w-[22px]',
            index > 0 && '-ml-2.5',
          )}
          style={{ zIndex: visibleTypes.length - index }}
        >
          <ToolIcon type={type} isAnimating={isAnimating} className="size-3" />
        </div>
      ))}
      {overflowCount > 0 && (
        <div
          className={cn(
            'relative flex items-center justify-center rounded-full border border-border-medium bg-surface-tertiary',
            '-ml-2.5 h-[22px] w-[22px] text-xs font-medium text-text-secondary',
          )}
          style={{ zIndex: 0 }}
        >
          +{overflowCount}
        </div>
      )}
    </div>
  );
}
