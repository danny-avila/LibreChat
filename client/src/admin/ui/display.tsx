import {
  Alert as AppAlert,
  Separator as AppSeparator,
  disabledInkClasses,
} from '@librechat/client';
import type { CSSProperties, ReactNode } from 'react';
import { useLocalize } from '~/hooks';
import { Icon } from './Icon';
import { cn } from '~/utils';

/**
 * Click-ui's display components, on SassyChat's semantic theme roles, keeping the call shape the
 * admin panel uses.
 */

export type BadgeState =
  | 'default'
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'disabled';

const BADGE_STATES: Record<BadgeState, string> = {
  default: 'bg-surface-secondary text-text-primary',
  neutral: 'bg-surface-secondary text-text-secondary',
  success: 'bg-status-success-subtle text-status-success',
  warning: 'bg-status-warning-subtle text-status-warning',
  danger: 'bg-alert-error-fill text-status-error',
  info: 'bg-status-info-subtle text-status-info',
  disabled: 'bg-surface-secondary text-text-tertiary',
};

export function Badge({
  text,
  state = 'default',
  size = 'sm',
  className,
}: {
  text: ReactNode;
  state?: BadgeState;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        BADGE_STATES[state] ?? BADGE_STATES.default,
        className,
      )}
    >
      {text}
    </span>
  );
}

const ALERT_STATES = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
  neutral: 'neutral',
} as const;

export function Alert({
  text,
  title,
  state = 'info',
  type: _type,
  className,
}: {
  text: ReactNode;
  title?: ReactNode;
  state?: keyof typeof ALERT_STATES;
  type?: 'default' | 'banner';
  className?: string;
}) {
  return (
    <AppAlert variant={ALERT_STATES[state] ?? 'info'} className={className}>
      {title && <p className="font-medium">{title}</p>}
      <div>{text}</div>
    </AppAlert>
  );
}

export function Separator({ size: _size, className }: { size?: string; className?: string }) {
  return <AppSeparator className={cn('my-2', className)} />;
}

const TITLE_SIZES = {
  h1: 'text-2xl font-semibold',
  h2: 'text-xl font-semibold',
  h3: 'text-lg font-semibold',
  h4: 'text-base font-semibold',
  h5: 'text-sm font-semibold',
  h6: 'text-sm font-medium',
} as const;

export function Title({
  type = 'h2',
  className,
  children,
}: {
  type?: keyof typeof TITLE_SIZES;
  className?: string;
  children?: ReactNode;
}) {
  const Heading = type;
  return (
    <Heading className={cn('text-text-primary', TITLE_SIZES[type], className)}>{children}</Heading>
  );
}

const PADDING = { none: 'p-0', xs: 'p-1', sm: 'p-2', md: 'p-4', lg: 'p-6', xl: 'p-8' } as const;
const RADII = {
  none: 'rounded-none',
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
} as const;

export function Panel({
  padding = 'md',
  radii = 'md',
  hasBorder,
  hasShadow,
  color: _color,
  className,
  children,
}: {
  padding?: keyof typeof PADDING;
  radii?: keyof typeof RADII;
  hasBorder?: boolean;
  hasShadow?: boolean;
  color?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-surface-primary',
        PADDING[padding],
        RADII[radii],
        hasBorder && 'border-border-light border',
        hasShadow && 'shadow-md',
        className,
      )}
    >
      {children}
    </div>
  );
}

const GAPS = {
  none: 'gap-0',
  xxs: 'gap-0.5',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-3',
  lg: 'gap-4',
  xl: 'gap-6',
  xxl: 'gap-8',
} as const;
const ALIGN = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
} as const;
const JUSTIFY = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  'space-between': 'justify-between',
} as const;

export function Container({
  orientation = 'horizontal',
  gap = 'none',
  alignItems,
  justifyContent,
  style,
  className,
  children,
}: {
  orientation?: 'horizontal' | 'vertical';
  gap?: keyof typeof GAPS;
  alignItems?: keyof typeof ALIGN;
  justifyContent?: keyof typeof JUSTIFY;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={style}
      className={cn(
        'flex',
        orientation === 'vertical' ? 'flex-col' : 'flex-row',
        GAPS[gap],
        alignItems && ALIGN[alignItems],
        justifyContent && JUSTIFY[justifyContent],
        className,
      )}
    >
      {children}
    </div>
  );
}

const LINK_WEIGHTS = {
  normal: undefined,
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
} as const;

export function Link({
  href,
  target,
  rel,
  size = 'md',
  weight = 'normal',
  className,
  children,
}: {
  href: string;
  target?: string;
  rel?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  className?: string;
  children?: ReactNode;
}) {
  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={cn(
        'text-text-primary underline underline-offset-2 hover:no-underline',
        size === 'xs' && 'text-xs',
        size === 'sm' && 'text-sm',
        size === 'lg' && 'text-lg',
        LINK_WEIGHTS[weight],
        className,
      )}
    >
      {children}
    </a>
  );
}

const AVATAR_TEXT = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' } as const;

export function Avatar({
  text,
  textSize = 'md',
  title,
  className,
}: {
  text: string;
  textSize?: 'sm' | 'md' | 'lg';
  title?: string;
  className?: string;
}) {
  const initials = text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <span
      title={title}
      aria-hidden="true"
      className={cn(
        'bg-surface-tertiary text-text-primary inline-flex size-8 shrink-0 items-center justify-center rounded-full font-medium',
        AVATAR_TEXT[textSize],
        className,
      )}
    >
      {initials || '?'}
    </span>
  );
}

/** Page navigation: previous, the current page of the total, next. */
export function Pagination({
  currentPage,
  totalPages,
  onChange,
}: {
  currentPage: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const localize = useLocalize();
  const pages = Math.max(1, totalPages);
  return (
    <nav
      aria-label={localize('com_admin_a11y_pagination')}
      className="flex items-center justify-center gap-2 text-sm"
    >
      <button
        type="button"
        className={cn(
          'hover:bg-surface-hover focus-visible:ring-focus-control rounded-md p-1.5 focus-visible:ring-2 focus-visible:outline-hidden disabled:opacity-40',
          disabledInkClasses,
        )}
        disabled={currentPage <= 1}
        onClick={() => onChange(currentPage - 1)}
        aria-label={localize('com_admin_a11y_previous_page')}
      >
        <Icon name="chevron-left" size="sm" aria-hidden />
      </button>
      <span className="text-text-secondary tabular-nums" aria-live="polite">
        {currentPage} / {pages}
      </span>
      <button
        type="button"
        className={cn(
          'hover:bg-surface-hover focus-visible:ring-focus-control rounded-md p-1.5 focus-visible:ring-2 focus-visible:outline-hidden disabled:opacity-40',
          disabledInkClasses,
        )}
        disabled={currentPage >= pages}
        onClick={() => onChange(currentPage + 1)}
        aria-label={localize('com_admin_a11y_next_page')}
      >
        <Icon name="chevron-right" size="sm" aria-hidden />
      </button>
    </nav>
  );
}
