import { useRecoilState } from 'recoil';
import { useEffect, type ChangeEvent, useState } from 'react';
import { useChatContext } from '~/Providers';
import { useRequiresKey } from '~/hooks';
import AttachFile from './Files/AttachFile';
import StopButton from './StopButton';
import SendButton from './SendButton';
import Images from './Files/Images';
import Textarea from './Textarea';
import store from '~/store';

export default function ChatForm({ index = 0 }) {
  const [text, setText] = useRecoilState(store.textByIndex(index));
  const {
    ask,
    files,
    setFiles,
    conversation,
    isSubmitting,
    handleStopGenerating,
    filesLoading,
    setFilesLoading,
    showStopButton,
    setShowStopButton,
  } = useChatContext();

  const sendMessage = () => {
    if (!text) return;
    ask({ text });
    setText('');
  };

  const { requiresKey } = useRequiresKey();
  // TODO: change back to null after proto
  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: 'used to be null' };
  const endpoint = endpointType ?? _endpoint;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        sendMessage();
      }}
      className="stretch mx-2 flex flex-row gap-3 last:mb-2 md:mx-4 md:last:mb-6 lg:mx-auto lg:max-w-2xl xl:max-w-3xl"
    >
      <div className="relative flex h-full flex-1 items-stretch md:flex-col">
        <div className="flex w-full items-center">
          <div className="[&:has(textarea:focus)]:border-token-border-xheavy border-token-border-heavy shadow-xs dark:shadow-xs relative flex w-full flex-grow flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.95)] dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:shadow-[0_0_0_2px_rgba(52,53,65,0.95)] [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]">
            <Images files={files} setFiles={setFiles} setFilesLoading={setFilesLoading} />
            {endpoint && (
              <Textarea
                value={text}
                disabled={requiresKey}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
                setText={setText}
                submitMessage={sendMessage}
                endpoint={endpoint}
              />
            )}
            <AttachFile endpoint={endpoint ?? ''} disabled={requiresKey} />
            {isSubmitting && showStopButton ? (
              <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
            ) : (
              endpoint && (
                <SendButton
                  onClick={async (e) => {
                    e.preventDefault();
                    sendMessage();
                  }}
                  text={text}
                  disabled={filesLoading || isSubmitting || requiresKey}
                />
              )
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

// useEffect(() => {
//     const events = new SSE(apiUrl, {
//       payload: JSON.stringify(payload),
//       headers,
//     });

//     events.onmessage = (e: MessageEvent) => {
//       console.log("PROTO EVENTS message: ", e)
//       console.log("PROTO EVENTS data: ", JSON.parse(e.data))
//     };

//     events.onopen = () => console.log('PROTO connection is opened');

//     events.oncancel = () => {
//       console.log('PROTO EVENTS connection is cancelled')
//     };

//     events.onerror = function (e: MessageEvent) {
//       console.log('PROTO EVENTS error in server stream', e);
//     };

//     events.stream();

//     return () => {
//       events.close();
//     };
// }, [])
