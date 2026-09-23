import * as React from 'react';
import { fieldControl } from './Field';
import { cn } from '~/utils';
import './Field.css';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  colorTransition?: boolean;
};

const Input: React.ForwardRefExoticComponent<InputProps & React.RefAttributes<HTMLInputElement>> =
  React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, colorTransition, ...props }, ref) => {
      return (
        <input
          className={cn(
            fieldControl,
            'ring-offset-surface-primary',
            colorTransition && 'transition-colors',
            className ?? '',
          )}
          ref={ref}
          {...props}
        />
      );
    },
  );

Input.displayName = 'Input';

export { Input };
