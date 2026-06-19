import * as React from 'react';
import { Info, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ClassProp } from 'class-variance-authority/types';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '~/utils';

const alertVariants: (
  props?:
    | ({
        variant?: 'info' | 'success' | 'warning' | 'error' | 'neutral' | null | undefined;
      } & ClassProp)
    | undefined,
) => string = cva('relative flex gap-3 rounded-xl border px-4 py-3 text-sm', {
  variants: {
    variant: {
      info: 'border-status-info bg-status-info-subtle text-status-info',
      success: 'border-status-success bg-status-success-subtle text-status-success',
      warning: 'border-status-warning bg-status-warning-subtle text-status-warning',
      error: 'border-status-error bg-status-error-subtle text-status-error',
      neutral: 'border-status-neutral bg-status-neutral-subtle text-status-neutral',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
});

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>['variant']>;

const defaultIcons: Record<AlertVariant, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  neutral: Info,
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Override the default per-variant icon, or pass `false` to hide it. */
  icon?: React.ReactNode | false;
}

const Alert: React.ForwardRefExoticComponent<
  AlertProps & React.RefAttributes<HTMLDivElement>
> = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'info', icon, role = 'alert', children, ...props }, ref) => {
    const resolvedVariant = (variant ?? 'info') as AlertVariant;
    const DefaultIcon = defaultIcons[resolvedVariant];
    return (
      <div ref={ref} role={role} className={cn(alertVariants({ variant }), className)} {...props}>
        {icon !== false && (
          <span className="mt-0.5 shrink-0" aria-hidden="true">
            {icon ?? <DefaultIcon className="size-4" />}
          </span>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  },
);
Alert.displayName = 'Alert';

export { Alert, alertVariants };
