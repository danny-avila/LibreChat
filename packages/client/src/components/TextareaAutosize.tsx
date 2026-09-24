import {
  forwardRef,
  RefAttributes,
  ForwardRefExoticComponent,
  useLayoutEffect,
  useState,
} from 'react';
import { useAtomValue } from 'jotai';
import ReactTextareaAutosize from 'react-textarea-autosize';
import type { TextareaAutosizeProps } from 'react-textarea-autosize';
import { chatDirectionAtom } from '~/store';

type BaseTextareaAutosizeProps = Omit<TextareaAutosizeProps, 'aria-label' | 'aria-labelledby'>;

export type TextareaAutosizePropsWithAria =
  | (BaseTextareaAutosizeProps & {
      'aria-label': string;
      'aria-labelledby'?: never;
    })
  | (BaseTextareaAutosizeProps & {
      'aria-labelledby': string;
      'aria-label'?: never;
    });

export const TextareaAutosize: ForwardRefExoticComponent<
  TextareaAutosizePropsWithAria & RefAttributes<HTMLTextAreaElement>
> = forwardRef<HTMLTextAreaElement, TextareaAutosizePropsWithAria>((props, ref) => {
  const [, setIsRerendered] = useState(false);
  const chatDirection = useAtomValue(chatDirectionAtom).toLowerCase();
  useLayoutEffect(() => setIsRerendered(true), []);
  return <ReactTextareaAutosize dir={chatDirection} {...props} ref={ref} />;
});
