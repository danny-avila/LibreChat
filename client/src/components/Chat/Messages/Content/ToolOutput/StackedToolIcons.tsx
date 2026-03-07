import { useMemo } from 'react';
import ToolIcon, { getToolIconType, getMCPServerName } from './ToolIcon';
import type { ToolIconType } from './ToolIcon';
import { cn } from '~/utils';

interface ResolvedIcon {
  key: string;
  type: ToolIconType;
  iconUrl?: string;
}

interface StackedToolIconsProps {
  toolNames: string[];
  mcpIconMap?: Map<string, string>;
  maxIcons?: number;
  isAnimating?: boolean;
}

export default function StackedToolIcons({
  toolNames,
  mcpIconMap,
  maxIcons = 3,
  isAnimating = false,
}: StackedToolIconsProps) {
  const uniqueIcons = useMemo(() => {
    const seen = new Set<string>();
    const result: ResolvedIcon[] = [];
    for (const name of toolNames) {
      const type = getToolIconType(name);
      const serverName = getMCPServerName(name);
      const iconUrl = serverName ? mcpIconMap?.get(serverName) : undefined;
      const key = iconUrl ? `mcp-${serverName}` : type;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ key, type, iconUrl });
      }
    }
    return result;
  }, [toolNames, mcpIconMap]);

  const visibleIcons = uniqueIcons.slice(0, maxIcons);
  const overflowCount = uniqueIcons.length - visibleIcons.length;

  if (visibleIcons.length <= 1) {
    const icon = visibleIcons[0];
    return (
      <ToolIcon type={icon?.type ?? 'generic'} iconUrl={icon?.iconUrl} isAnimating={isAnimating} />
    );
  }

  return (
    <div className="flex items-center" aria-hidden="true">
      {visibleIcons.map((icon, index) => (
        <div
          key={icon.key}
          className={cn(
            'relative flex items-center justify-center rounded-full border border-border-medium bg-surface-secondary',
            'h-[22px] w-[22px]',
            index > 0 && '-ml-2.5',
          )}
          style={{ zIndex: visibleIcons.length - index }}
        >
          <ToolIcon
            type={icon.type}
            iconUrl={icon.iconUrl}
            isAnimating={isAnimating}
            className="size-3"
          />
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
