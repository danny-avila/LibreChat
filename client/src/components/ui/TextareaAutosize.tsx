import { forwardRef, useLayoutEffect, useState } from 'react';
import ReactTextareaAutosize from 'react-textarea-autosize';
import type { TextareaAutosizeProps } from 'react-textarea-autosize';
export const TextareaAutosize = forwardRef<HTMLTextAreaElement, TextareaAutosizeProps>(
  (props, ref) => {
    const [, setIsRerendered] = useState(false);
    useLayoutEffect(() => setIsRerendered(true), []);
    return <ReactTextareaAutosize {...props} ref={ref} />;
  },
);
