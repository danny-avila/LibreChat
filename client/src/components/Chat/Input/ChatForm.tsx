import { useRecoilState } from 'recoil';
import { useEffect, type ChangeEvent } from 'react';
import { useChatContext } from '~/Providers';
import { useRequiresKey } from '~/hooks';
import AttachFile from './Files/AttachFile';
import StopButton from './StopButton';
import SendButton from './SendButton';
import FileRow from './Files/FileRow';
import Textarea from './Textarea';
import store from '~/store';
import Voice from './Voice';

export default function ChatForm({ index = 0 }) {
  const [text, setText] = useRecoilState(store.textByIndex(index));
  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));

  const {
    ask,
    files,
    setFiles,
    conversation,
    isSubmitting,
    handleStopGenerating,
    filesLoading,
    setFilesLoading,
    recordingSate,
    recordedText,
    setRecordedText,
  } = useChatContext();

  const submitMessage = () => {
    if (!recordedText && recordingSate !== 'recording') {
      ask({ text });
      setText('');
    }
  };

  useEffect(() => {
    if (recordedText) {
      setText(text + ' ' + recordedText);
      setRecordedText(undefined);
    }
  }, [recordedText]);

  const { requiresKey } = useRequiresKey();
  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: null };
  const endpoint = endpointType ?? _endpoint;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submitMessage();
      }}
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
              <Textarea
                value={text}
                disabled={requiresKey}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
                setText={setText}
                submitMessage={submitMessage}
                endpoint={_endpoint}
                endpointType={endpointType}
              />
            )}
            <div className="absolute bottom-1.5 left-2 flex gap-1 md:bottom-3 md:left-4">
              <AttachFile
                endpoint={_endpoint ?? ''}
                endpointType={endpointType}
                disabled={requiresKey}
              />
              <Voice disabled={requiresKey} />
            </div>
            {isSubmitting && showStopButton ? (
              <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
            ) : (
              endpoint && (
                <SendButton
                  text={text}
                  disabled={filesLoading || isSubmitting || requiresKey || recordingSate !== 'idle'}
                />
              )
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
