import React, { ForwardedRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import {
  supportsFiles,
  fileConfig as defaultFileConfig,
  mergeFileConfig,
} from 'librechat-data-provider';
import { useGetFileConfig } from '~/data-provider';
import { cn, removeFocusOutlines } from '~/utils';
import { useTextarea } from '~/hooks';
import { EModelEndpoint } from 'librechat-data-provider';

interface TextareaProps {
  disabled?: boolean;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  submitMessage: () => void;
  endpoint: EModelEndpoint | null;
  endpointType: EModelEndpoint | undefined;
}

const Textarea = React.forwardRef(
  (
    { disabled = false, onChange, submitMessage, endpoint, endpointType }: TextareaProps,
    ref: ForwardedRef<HTMLTextAreaElement>,
  ) => {
    const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
      select: (data) => mergeFileConfig(data),
    });
    const {
      handlePaste,
      handleKeyUp,
      handleKeyDown,
      handleCompositionStart,
      handleCompositionEnd,
    } = useTextarea({
      submitMessage,
      disabled,
      textAreaRef: ref as React.MutableRefObject<HTMLTextAreaElement | null>,
    });
    const endpointFileConfig = fileConfig.endpoints[endpoint ?? ''];
    return (
      <TextareaAutosize
        ref={ref}
        autoFocus
        disabled={!!disabled}
        onChange={onChange}
        onPaste={handlePaste}
        onKeyUp={handleKeyUp}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        id="prompt-textarea"
        tabIndex={0}
        data-testid="text-input"
        style={{ height: 44, overflowY: 'auto' }}
        rows={1}
        className={cn(
          supportsFiles[endpointType ?? endpoint ?? ''] && !endpointFileConfig?.disabled
            ? ' pl-10 md:pl-[55px]'
            : 'pl-3 md:pl-4',
          'm-0 w-full resize-none border-0 bg-transparent py-[10px] pr-10 placeholder-black/50 focus:ring-0 focus-visible:ring-0 dark:bg-transparent dark:placeholder-white/50 md:py-3.5 md:pr-12 ',
          removeFocusOutlines,
          'max-h-[65vh] md:max-h-[85vh]',
        )}
      />
    );
  },
);

export default Textarea;
