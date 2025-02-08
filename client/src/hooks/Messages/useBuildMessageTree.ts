import { useRecoilCallback } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import store from '~/store';

export default function useBuildMessageTree() {
  const getSiblingIdx = useRecoilCallback(
    ({ snapshot }) =>
      async (messageId: string | null | undefined) =>
        await snapshot.getPromise(store.messagesSiblingIdxFamily(messageId)),
    [],
  );

  // return an object or an array based on branches and recursive option
  // messageId is used to get siblindIdx from recoil snapshot
  const buildMessageTree = async ({
    messageId,
    message,
    messages,
    branches = false,
    recursive = false,
  }: {
    messageId: string | null | undefined;
    message: TMessage | null;
    messages: TMessage[] | null;
    branches?: boolean;
    recursive?: boolean;
  }): Promise<TMessage | TMessage[]> => {
    let children: TMessage[] = [];
    if (messages?.length) {
      if (branches) {
        for (const message of messages) {
          children.push(
            (await buildMessageTree({
              messageId: message.messageId,
              message: message,
              messages: message.children || [],
              branches,
              recursive,
            })) as TMessage,
          );
        }
      } else {
        let message = messages[0];
        if (messages.length > 1) {
          const siblingIdx = await getSiblingIdx(messageId);
          message = messages[messages.length - siblingIdx - 1];
        }

        children = [
          (await buildMessageTree({
            messageId: message.messageId,
            message: message,
            messages: message.children || [],
            branches,
            recursive,
          })) as TMessage,
        ];
      }
    }

    if (recursive && message) {
      return { ...message, children: children };
    } else {
      let ret: TMessage[] = [];
      if (message) {
        const _message = { ...message };
        delete _message.children;
        ret = [_message];
      }
      for (const child of children) {
        ret = ret.concat(child);
      }
      return ret;
    }
  };

  return buildMessageTree;
}
