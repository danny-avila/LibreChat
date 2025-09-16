import DOMPurify from 'dompurify';
import * as Ariakit from '@ariakit/react';
import { forwardRef, useId, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '~/utils';
import './Tooltip.css';

interface TooltipAnchorProps extends Ariakit.TooltipAnchorProps {
  role?: string;
  className?: string;
  description: string;
  enableHTML?: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export const TooltipAnchor = forwardRef<HTMLDivElement, TooltipAnchorProps>(function TooltipAnchor(
  { description, side = 'top', className, role, enableHTML = false, ...props },
  ref,
) {
  const tooltip = Ariakit.useTooltipStore({ placement: side });
  const mounted = Ariakit.useStoreState(tooltip, (state) => state.mounted);
  const placement = Ariakit.useStoreState(tooltip, (state) => state.placement);

  const id = useId();
  const sanitizer = useMemo(() => {
    const instance = DOMPurify();
    instance.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName && node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
    return instance;
  }, []);

  const sanitizedHTML = useMemo(() => {
    if (!enableHTML) {
      return '';
    }
    try {
      return sanitizer.sanitize(description, {
        ALLOWED_TAGS: ['a', 'strong', 'b', 'em', 'i', 'br', 'code'],
        ALLOWED_ATTR: ['href', 'class', 'target', 'rel'],
        ALLOW_DATA_ATTR: false,
        ALLOW_ARIA_ATTR: false,
      });
    } catch (error) {
      console.error('Sanitization failed', error);
      return description;
    }
  }, [enableHTML, description, sanitizer]);

  const { x, y } = useMemo(() => {
    const dir = placement.split('-')[0];
    switch (dir) {
      case 'top':
        return { x: 0, y: -8 };
      case 'bottom':
        return { x: 0, y: 8 };
      case 'left':
        return { x: -8, y: 0 };
      case 'right':
        return { x: 8, y: 0 };
      default:
        return { x: 0, y: 0 };
    }
  }, [placement]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (role === 'button' && event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLDivElement).click();
    }
  };

  return (
    <Ariakit.TooltipProvider store={tooltip} hideTimeout={0}>
      <Ariakit.TooltipAnchor
        {...props}
        ref={ref}
        role={role}
        aria-describedby={id}
        onKeyDown={handleKeyDown}
        className={cn('cursor-pointer', className)}
      />
      <AnimatePresence>
        {mounted === true && (
          <Ariakit.Tooltip
            gutter={4}
            alwaysVisible
            className="tooltip"
            id={id}
            render={
              <motion.div
                initial={{ opacity: 0, x, y }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x, y }}
              />
            }
          >
            <Ariakit.TooltipArrow />
            {enableHTML ? (
              <div
                dangerouslySetInnerHTML={{
                  __html: sanitizedHTML,
                }}
              />
            ) : (
              description
            )}
          </Ariakit.Tooltip>
        )}
      </AnimatePresence>
    </Ariakit.TooltipProvider>
  );
});
