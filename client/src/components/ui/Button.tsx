import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'outline' | 'default';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'default', ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm focus:outline-none ${variant === 'outline'
                        ? 'border border-border bg-surface text-text-primary hover:bg-border/10'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    } ${className || ''}`}
                {...props}
            />
        );
    }
);
Button.displayName = 'Button';
