import { useRecoilState } from 'recoil';
import { useState, type ChangeEvent } from 'react';
import { useChatContext } from '~/Providers';
import { useRequiresKey } from '~/hooks';
import AudioRecorderButton from './AudioRecorderButton';
import AttachFile from './Files/AttachFile';
import StopButton from './StopButton';
import SendButton from './SendButton';
import FileRow from './Files/FileRow';
import Textarea from './Textarea';
import store from '~/store';

export default function ChatForm({ index = 0 }) {
  const [text, setText] = useRecoilState(store.textByIndex(index));
  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
  const [isRecording, setIsRecording] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

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

  const submitMessage = () => {
    ask({ text });
    setText('');
  };

  const { requiresKey } = useRequiresKey();
  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: null };
  const endpoint = endpointType ?? _endpoint;

  const handleRecordingChange = (recording: boolean) => {
    setIsRecording(recording);
  };

  const handleFetchingChange = (recording: boolean) => {
    setIsFetching(recording);
  };

  const handleTranscription = (transcription: string) => {
    setText(transcription);
  };

  let buttonComponent: React.JSX.Element | undefined;

  if (isSubmitting && showStopButton) {
    buttonComponent = (
      <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
    );
  } else if (endpoint) {
    buttonComponent = (
      <SendButton
        text={text}
        disabled={filesLoading || isSubmitting || requiresKey || isRecording || isFetching}
      />
    );

    if (text === '') {
      buttonComponent = (
        <>
          <SendButton
            text={text}
            disabled={filesLoading || isSubmitting || requiresKey || isRecording || isFetching}
          />
          <AudioRecorderButton
            index={index}
            onTranscription={handleTranscription}
            onFetchingChange={handleFetchingChange}
            onRecordingChange={handleRecordingChange}
          />
        </>
      );
    }
  }

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
                disabled={requiresKey || isRecording || isFetching}
                isRecording={isRecording}
                isFetching={isFetching}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
                setText={setText}
                submitMessage={submitMessage}
                endpoint={_endpoint}
                endpointType={endpointType}
              />
            )}
            <AttachFile
              endpoint={_endpoint ?? ''}
              endpointType={endpointType}
              disabled={requiresKey}
            />

            {buttonComponent}
          </div>
        </div>
      </div>
    </form>
  );
}
