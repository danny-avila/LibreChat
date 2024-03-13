import { useRecoilState } from 'recoil';
import { memo, useCallback, useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useForm } from 'react-hook-form';
import {
  supportsFiles,
  mergeFileConfig,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import { useRequiresKey, useTextarea } from '~/hooks';
import { useGetFileConfig } from '~/data-provider';
import { cn, removeFocusOutlines } from '~/utils';
import { useChatContext } from '~/Providers';
import AttachFile from './Files/AttachFile';
import StopButton from './StopButton';
import SendButton from './SendButton';
import FileRow from './Files/FileRow';
import store from '~/store';

const ChatForm = ({ index = 0 }) => {
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
  const { requiresKey } = useRequiresKey();

  const { handlePaste, handleKeyUp, handleKeyDown, handleCompositionStart, handleCompositionEnd } =
    useTextarea({ textAreaRef, submitButtonRef, disabled: !!requiresKey });

  const {
    ask,
    files,
    setFiles,
    conversation,
    isSubmitting,
    handleStopGenerating,
    filesLoading,
    setFilesLoading,
  } = useChatContext();

  const methods = useForm<{ text: string }>({
    defaultValues: { text: '' },
  });

  const submitMessage = useCallback(
    (data?: { text: string }) => {
      if (!data) {
        return console.warn('No data provided to submitMessage');
      }
      ask({ text: data.text });
      methods.reset();
      textAreaRef.current?.setRangeText('', 0, data.text.length, 'end');
    },
    [ask, methods],
  );

  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: null };
  const endpoint = endpointType ?? _endpoint;

  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const endpointFileConfig = fileConfig.endpoints[endpoint ?? ''];

  return (
    <form
      onSubmit={methods.handleSubmit((data) => submitMessage(data))}
      className="stretch mx-2 flex flex-row gap-3 last:mb-2 md:mx-4 md:last:mb-6 lg:mx-auto lg:max-w-2xl xl:max-w-3xl"
    >
      <div className="relative flex h-full flex-1 items-stretch md:flex-col">
        <div className="flex w-full items-center">
          <div className="[&:has(textarea:focus)]:border-token-border-xheavy dark:border-token-border-medium border-token-border-medium bg-token-main-surface-primary relative flex w-full flex-grow flex-col overflow-hidden rounded-2xl border dark:text-white [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]">
            <FileRow
              files={files}
              setFiles={setFiles}
              setFilesLoading={setFilesLoading}
              Wrapper={({ children }) => (
                <div className="mx-2 mt-2 flex flex-wrap gap-2 px-2.5 md:pl-0 md:pr-4">
                  {children}
                </div>
              )}
            />
            {endpoint && (
              <TextareaAutosize
                {...methods.register('text', {
                  required: true,
                  onChange: (e) => {
                    methods.setValue('text', e.target.value);
                  },
                })}
                autoFocus
                ref={(e) => {
                  textAreaRef.current = e;
                }}
                disabled={!!requiresKey}
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
            )}
            <AttachFile
              endpoint={_endpoint ?? ''}
              endpointType={endpointType}
              disabled={requiresKey}
            />
            {isSubmitting && showStopButton ? (
              <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
            ) : (
              endpoint && (
                <SendButton
                  ref={submitButtonRef}
                  control={methods.control}
                  disabled={!!(filesLoading || isSubmitting || requiresKey)}
                />
              )
            )}
          </div>
        </div>
      </div>
    </form>
  );
};

export default memo(ChatForm);
