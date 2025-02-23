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
  return (
    <motion.button
      onClick={(e) => {
        if (!isEditing && onToggle) {
          if (typeof window !== 'undefined' && window.innerWidth >= 768) {
            e.preventDefault();
          }
          e.stopPropagation();
          onToggle();
        }
      }}
      className={cn(
        'group relative inline-flex transform-gpu items-center gap-1.5 rounded-full px-4 py-1.5 transition-all',
        'text-sm font-medium',
        'border border-border-medium',
        isActive
          ? 'bg-surface-active shadow-md'
          : 'bg-surface-chat shadow-sm hover:bg-surface-hover hover:shadow-md',
        isEditing && isAvailable !== false && 'cursor-move',
        className,
      )}
      whileTap={{ scale: 0.95 }}
      animate={{
        scale: isDragging ? 1.1 : 1,
        boxShadow: isDragging ? '0 10px 25px rgba(0,0,0,0.1)' : '',
      }}
      transition={{
        type: 'tween',
        duration: 0.15,
        ease: 'easeOut',
      }}
      {...props}
    >
      <motion.div
        className="absolute inset-0 rounded-full bg-surface-hover"
        initial={false}
        animate={{ opacity: isActive ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div className="relative flex items-center gap-1.5">
        {Icon && <Icon className="h-4 w-4" />}
        <span className="hidden md:inline">{label}</span>
      </motion.div>
      {isEditing && !isDragging && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          whileTap={{ scale: 0.9 }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onBadgeAction?.();
          }}
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface-secondary-alt p-0.5 text-text-primary"
        >
          {isAvailable === true ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </motion.button>
      )}
    </motion.button>
  );
}
