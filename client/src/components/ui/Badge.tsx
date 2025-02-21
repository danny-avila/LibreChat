import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '~/utils';

interface BadgeProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  label: string;
  isActive?: boolean;
  isEditing?: boolean;
  isDragging?: boolean;
  onDelete?: () => void;
}

export default function Badge({
  icon: Icon,
  label,
  isActive = false,
  isEditing = false,
  isDragging = false,
  onDelete,
  className,
  ...props
}: BadgeProps) {
  return (
    <button
      className={cn(
        'group relative inline-flex items-center gap-1.5 rounded-full px-4 py-1.5',
        'text-sm font-medium transition-colors',
        'hover:bg-surface-hover active:bg-surface-active',
        'border border-border-medium shadow-sm',
        isActive && 'bg-surface-active',
        !isActive && 'bg-surface-chat',
        isEditing && 'animate-shake cursor-move',
        isDragging && 'scale-105 opacity-90 shadow-lg',
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4" />}
      <span>{label}</span>
      {isEditing && !isDragging && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gray-500 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </button>
  );
}
