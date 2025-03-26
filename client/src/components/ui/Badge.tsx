'use client';

import type React from 'react';

import { X, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '~/utils';

interface BadgeProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  label: string;
  isActive?: boolean;
  isEditing?: boolean;
  isDragging?: boolean;
  isAvailable: boolean;
  onBadgeAction?: () => void;
  onToggle?: () => void;
}

export default function Badge({
  icon: Icon,
  label,
  isActive = false,
  isEditing = false,
  isDragging = false,
  isAvailable = true,
  onBadgeAction,
  onToggle,
  className,
  ...props
}: BadgeProps) {
  const isMoveable = isEditing && isAvailable;

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (!isEditing && onToggle) {
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        e.preventDefault();
      }
      e.stopPropagation();
      onToggle();
    }
  };

  return (
    <motion.button
      onClick={handleClick}
      className={cn(
        'group relative inline-flex items-center gap-1.5 rounded-full px-4 py-1.5',
        'border border-border-medium text-sm font-medium transition-shadow md:w-full',
        'size-9 p-2 md:p-3',
        isActive
          ? 'bg-surface-active shadow-md'
          : 'bg-surface-chat shadow-sm hover:bg-surface-hover hover:shadow-md',
        'active:scale-95 active:shadow-inner',
        isMoveable && 'cursor-move',
        className,
      )}
      animate={{
        scale: isDragging ? 1.1 : 1,
        boxShadow: isDragging ? '0 10px 25px rgba(0,0,0,0.1)' : undefined,
      }}
      whileTap={{ scale: isDragging ? 1.1 : 0.97 }}
      transition={{ type: 'tween', duration: 0.1, ease: 'easeOut' }}
      {...props}
    >
      {Icon && <Icon className={cn('relative h-5 w-5 md:h-4 md:w-4', !label && 'mx-auto')} />}
      <span className="relative hidden md:inline">{label}</span>

      {isEditing && !isDragging && (
        <motion.button
          className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface-secondary-alt text-text-primary shadow-sm md:h-5 md:w-5"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          whileTap={{ scale: 0.9 }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onBadgeAction?.();
          }}
        >
          {isAvailable ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </motion.button>
      )}
    </motion.button>
  );
}
