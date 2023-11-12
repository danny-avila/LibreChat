import { memo } from 'react';
import { useRecoilState } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import MessagesView from '~/components/Assistants/Messages/MessagesView';
import CreationPanel from '~/components/Assistants/CreationPanel';
import { ChatContext } from '~/Providers';
import { useChatHelpers } from '~/hooks';
import store from '~/store';

function ChatView({
  messagesTree,
  index = 0,
}: {
  messagesTree?: TMessage[] | null;
  index?: number;
}) {
  const [text, setText] = useRecoilState(store.textByIndex(index));

  const { ask, ...rest } = useChatHelpers(index);
  const submitMessage = () => {
    ask({ text });
    setText('');
  };

  return (
    <ChatContext.Provider
      value={{
        ask,
        ...rest,
      }}
    >
      <div className="relative flex w-full grow overflow-hidden bg-white dark:bg-gray-800">
        <CreationPanel index={index} />
        <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden bg-white pt-10 dark:bg-gray-800 md:pt-0">
          <div className="flex h-full flex-col" role="presentation" tabIndex={0}>
            {messagesTree && messagesTree.length !== 0 && (
              <MessagesView messagesTree={messagesTree} index={index} />
            )}
            <div className="gizmo:border-t-0 gizmo:pl-0 gizmo:md:pl-0 w-full border-t pt-2 dark:border-white/20 md:w-[calc(100%-.5rem)] md:border-t-0 md:border-transparent md:pl-2 md:pt-0 md:dark:border-transparent">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitMessage();
                }}
                className="stretch mx-2 flex flex-row gap-3 last:mb-2 md:mx-4 md:last:mb-6 lg:mx-auto lg:max-w-2xl xl:max-w-3xl"
              >
                <div className="relative flex h-full flex-1 items-stretch md:flex-col">
                  <div className="flex w-full items-center">
                    <div className="gizmo:[&:has(textarea:focus)]:border-token-border-xheavy gizmo:[&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)] gizmo:dark:border-token-border-heavy gizmo:border-token-border-heavy gizmo:rounded-2xl shadow-xs dark:shadow-xs gizmo:dark:bg-gray-800 gizmo:shadow-[0_0_0_2px_rgba(255,255,255,0.95)] gizmo:dark:shadow-[0_0_0_2px_rgba(52,53,65,0.95)] relative flex w-full flex-grow flex-col overflow-hidden rounded-xl border border-black/10 bg-white dark:border-gray-900/50 dark:bg-gray-700 dark:text-white">
                      <textarea
                        id="prompt-textarea"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        tabIndex={0}
                        data-id="request-:R3apdm:-3"
                        style={{ maxHeight: '200px', height: '52px', overflowY: 'hidden' }}
                        rows={1}
                        placeholder="Message ChatGPT…"
                        className="gizmo:md:py-3.5 gizmo:placeholder-black/50 gizmo:dark:placeholder-white/50 gizmo:pl-10 gizmo:md:pl-[55px] m-0 w-full resize-none border-0 bg-transparent py-[10px] pl-12 pr-10 focus:ring-0 focus-visible:ring-0 dark:bg-transparent md:py-4 md:pl-[46px] md:pr-12"
                      ></textarea>

                      <button type="submit">Send</button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </ChatContext.Provider>
  );
}

export default memo(ChatView);
