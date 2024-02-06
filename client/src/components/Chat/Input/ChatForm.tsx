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
import { fetchEventSource } from '@microsoft/fetch-event-source'

export default function ChatForm({ index = 0 }) {
  console.log("chatform")
  const token = "8414cb31-e6c8-4197-91cf-1f388815429d";
  const [ abortController, setAbortController ] = useState(new AbortController());
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

  const submitMessage = () => {
    ask({ text });
    setText('');
  };



  const openStream = async () => {
    console.log(`[PROTO] ESTABLISHING CONNECTION WITH TOKEN: \n${token}\n and PROMPT: \n${text}`)

    const apiUrl = "https://dev-api.askvera.io/api/v1/chat";
    const apiKey = token;
    const payload = {
      "prompt_text": text,
      "stream": true
    }
    const headers = { 'Content-Type': 'application/json', 'x-vera-api-key': apiKey, }
  


fetchEventSource(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            async onopen(response) {
              console.log('[PROTO] OPENED CONNECTION:', response);
                if (response.ok) {
                    return; // everything's good
                } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    // client-side errors are usually non-retriable:
                    throw new Error();
                } else {
                    throw new Error();
                }
            },
            onmessage(msg) {
                console.log('[PROTO] NEW EVENT:', msg);
                if (msg.data) {
                  console.log('[PROTO] EVENT DATA:', JSON.parse(msg.data));
                }
                
            
                // Display the event data on the page
                // var newElement = document.createElement("p");
                // newElement.textContent = "New event: " + msg.data;
                // document.getElementById("eventStream").appendChild(newElement);
                // if the server emits an error message, throw an exception
                // so it gets handled by the onerror callback below:
                if (msg.event === 'FatalError') {
                    throw new Error(msg.data);
                }
            },
            onerror(e) {
              console.log("[PROTO] ERROR: ", e)
            },
            onclose() {
              console.log("[PROTO] CONNECTION CLOSED")
            }
        });

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
  

  const submitVeraMessage = () => {
    setText('')
  }

  const { requiresKey } = useRequiresKey();
  // TODO: change back to null after proto
  const { endpoint: _endpoint, endpointType } = conversation ?? { endpoint: "used to be null" };
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
          <div className="[&:has(textarea:focus)]:border-token-border-xheavy border-token-border-heavy shadow-xs dark:shadow-xs relative flex w-full flex-grow flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.95)] dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:shadow-[0_0_0_2px_rgba(52,53,65,0.95)] [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]">
            <Images files={files} setFiles={setFiles} setFilesLoading={setFilesLoading} />
            {endpoint && (
              <Textarea
                value={text}
                disabled={requiresKey}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
                setText={setText}
                submitMessage={submitMessage}
                endpoint={endpoint}
              />
            )}
            <AttachFile endpoint={endpoint ?? ''} disabled={requiresKey} />
            {isSubmitting && showStopButton ? (
              <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
            ) : (
              endpoint && (
                <SendButton onClick={async (e) => {e.preventDefault(); await openStream()}} text={text} disabled={filesLoading || isSubmitting || requiresKey} />
              )
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
