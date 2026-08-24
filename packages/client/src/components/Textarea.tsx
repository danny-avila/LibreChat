/* eslint-disable */
import * as React from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { fieldBase } from './Field';
import { cn } from '~/utils';
import './Field.css';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea: React.ForwardRefExoticComponent<
  TextareaProps & React.RefAttributes<HTMLTextAreaElement>
> = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className = '', ...props }, ref) => {
  return (
    <textarea
      className={cn(fieldBase, 'min-h-20 resize-none bg-surface-secondary', className)}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
