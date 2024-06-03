import { useForm } from 'react-hook-form';
import { useRecoilState, useRecoilValue } from 'recoil';
import { memo, useCallback, useRef, useMemo } from 'react';
import {
  supportsFiles,
  mergeFileConfig,
  isAssistantsEndpoint,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import { useChatContext, useAssistantsMapContext } from '~/Providers';
import { useRequiresKey, useTextarea } from '~/hooks';
import { TextareaAutosize } from '~/components/ui';
import { useGetFileConfig } from '~/data-provider';
import { cn, removeFocusRings } from '~/utils';
import AttachFile from './Files/AttachFile';
import AudioRecorder from './AudioRecorder';
import { mainTextareaId } from '~/common';
import StreamAudio from './StreamAudio';
import StopButton from './StopButton';
import SendButton from './SendButton';
import FileRow from './Files/FileRow';
import Mention from './Mention';
import store from '~/store';

const ChatForm = ({ index = 0 }) => {
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const SpeechToText = useRecoilValue(store.SpeechToText);
  const TextToSpeech = useRecoilValue(store.TextToSpeech);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
  const [showMentionPopover, setShowMentionPopover] = useRecoilState(
    store.showMentionPopoverFamily(index),
  );
  const { requiresKey } = useRequiresKey();

  const methods = useForm<{ text: string }>({
    defaultValues: { text: '' },
  });

  const { handlePaste, handleKeyDown, handleKeyUp, handleCompositionStart, handleCompositionEnd } =
    useTextarea({
      textAreaRef,
      submitButtonRef,
      disabled: !!requiresKey,
    });

  const {
    ask,
    files,
    setFiles,
    conversation,
    isSubmitting,
    filesLoading,
    setFilesLoading,
    handleStopGenerating,
  } = useChatContext();

  const assistantMap = useAssistantsMapContext();

  const submitMessage = useCallback(
    (data?: { text: string }) => {
      if (!data) {
        return console.warn('No data provided to submitMessage');
      }
      ask({ text: data.text });
      methods.reset();
    },
    [ask, methods],
  );

  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: null };
  const endpoint = endpointType ?? _endpoint;

  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });

  const endpointFileConfig = fileConfig.endpoints[endpoint ?? ''];
  const invalidAssistant = useMemo(
    () =>
      isAssistantsEndpoint(conversation?.endpoint) &&
      (!conversation?.assistant_id ||
        !assistantMap?.[conversation?.endpoint ?? '']?.[conversation?.assistant_id ?? '']),
    [conversation?.assistant_id, conversation?.endpoint, assistantMap],
  );
  const disableInputs = useMemo(
    () => !!(requiresKey || invalidAssistant),
    [requiresKey, invalidAssistant],
  );

  const { ref, ...registerProps } = methods.register('text', {
    required: true,
    onChange: (e) => {
      methods.setValue('text', e.target.value, { shouldValidate: true });
    },
  });

  return (
    <form
      onSubmit={methods.handleSubmit((data) => submitMessage(data))}
      className="stretch mx-2 flex flex-row gap-3 last:mb-2 md:mx-4 md:last:mb-6 lg:mx-auto lg:max-w-2xl xl:max-w-3xl"
    >
      <div className="relative flex h-full flex-1 items-stretch md:flex-col">
        <div className="flex w-full items-center">
          {showMentionPopover && (
            <Mention setShowMentionPopover={setShowMentionPopover} textAreaRef={textAreaRef} />
          )}
          <div className="bg-token-main-surface-primary relative flex w-full flex-grow flex-col overflow-hidden rounded-2xl border dark:border-gray-600 dark:text-white [&:has(textarea:focus)]:border-gray-300 [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)] dark:[&:has(textarea:focus)]:border-gray-500">
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
                {...registerProps}
                autoFocus
                ref={(e) => {
                  ref(e);
                  textAreaRef.current = e;
                }}
                disabled={disableInputs}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                onKeyUp={handleKeyUp}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                id={mainTextareaId}
                tabIndex={0}
                data-testid="text-input"
                style={{ height: 44, overflowY: 'auto' }}
                rows={1}
                className={cn(
                  supportsFiles[endpointType ?? endpoint ?? ''] && !endpointFileConfig?.disabled
                    ? ' pl-10 md:pl-[55px]'
                    : 'pl-3 md:pl-4',
                  'm-0 w-full resize-none border-0 bg-transparent py-[10px] placeholder-black/50 focus:ring-0 focus-visible:ring-0 dark:bg-transparent dark:placeholder-white/50 md:py-3.5  ',
                  SpeechToText ? 'pr-20 md:pr-[85px]' : 'pr-10 md:pr-12',
                  'max-h-[65vh] md:max-h-[75vh]',
                  removeFocusRings,
                )}
              />
            )}
            <AttachFile
              endpoint={_endpoint ?? ''}
              endpointType={endpointType}
              disabled={disableInputs}
            />
            {isSubmitting && showStopButton ? (
              <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
            ) : (
              endpoint && (
                <SendButton
                  ref={submitButtonRef}
                  control={methods.control}
                  disabled={!!(filesLoading || isSubmitting || disableInputs)}
                />
              )
            )}
            {SpeechToText && (
              <AudioRecorder
                disabled={!!disableInputs}
                textAreaRef={textAreaRef}
                ask={submitMessage}
                methods={methods}
              />
            )}
            {TextToSpeech && automaticPlayback && <StreamAudio index={index} />}
          </div>
        </div>
      </div>
    </form>
  );
};

export default memo(ChatForm);
