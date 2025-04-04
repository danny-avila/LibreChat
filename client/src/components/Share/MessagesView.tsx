import { useState } from 'react';
import type { TMessage } from 'librechat-data-provider';
import MultiMessage from './MultiMessage';

export default function MessagesView({
  messagesTree: _messagesTree,
  conversationId,
}: {
  messagesTree?: TMessage[] | null;
  conversationId: string;
}) {
  const [currentEditId, setCurrentEditId] = useState<number | string | null>(-1);
  return (
    <div className="flex-1 pb-[50px]">
      <div className="dark:gpt-dark-gray relative h-full">
        <div
          style={{
            height: '100%',
            overflowY: 'auto',
            width: '100%',
          }}
        >
          <div className="flex flex-col pb-9 text-sm dark:bg-transparent">
            {(_messagesTree && _messagesTree.length == 0) || _messagesTree === null ? (
              <div className="flex w-full items-center justify-center gap-1 bg-gray-50 p-3 text-sm text-gray-500 dark:border-gray-800/50 dark:bg-gray-800 dark:text-gray-300">
                Nothing found
              </div>
            ) : (
              <>
                <div>
                  <MultiMessage
                    key={conversationId} // avoid internal state mixture
                    messagesTree={_messagesTree}
                    messageId={conversationId ?? null}
                    setCurrentEditId={setCurrentEditId}
                    currentEditId={currentEditId ?? null}
                  />
                </div>
              </>
            )}
            <div className="dark:gpt-dark-gray group h-0 w-full flex-shrink-0 dark:border-gray-800/50" />
          </div>
        </div>
      </div>
    </div>
  );
}
