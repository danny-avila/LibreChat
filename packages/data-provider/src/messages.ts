import type { TMessageContentParts } from './types/assistants';
import type { TFile } from './types/files';
import type { TMessage } from './types';
import { ContentTypes } from './types/runs';

/** A generated reasoning title describes the text as it existed at generation time.
 *  Any manual edit or merge into a different reasoning step invalidates the entire
 *  title revision domain while preserving unrelated content metadata. */
export function stripReasoningLabelMetadata(part: TMessageContentParts): TMessageContentParts {
  if (part.type !== ContentTypes.THINK) {
    return part;
  }
  const {
    reasoning_label: _label,
    reasoning_label_step_id: _stepId,
    reasoning_label_attempts: _attempts,
    reasoning_label_submitted_chars: _submittedChars,
    reasoning_label_revision: _revision,
    reasoning_label_status: _status,
    ...unlabeledPart
  } = part;
  return unlabeledPart;
}

export type ParentMessage = TMessage & { children: TMessage[]; depth: number };

/**
 * Memoizes built trees per messages-array identity. The same query data feeds
 * several independent `select`s (ChatView plus the branch-tail helpers), which
 * used to rebuild the full tree five times per cache write. Exactly two slots
 * per array — the bare tree and the tree for the LATEST fileMap identity — so
 * a long-lived cached conversation cannot accumulate a tree per historical
 * file-map; entries die with the messages array itself.
 */
type TreeCacheEntry = {
  bare?: TMessage[];
  fileMap?: Record<string, TFile>;
  hydrated?: TMessage[];
};
const treeCache = new WeakMap<(TMessage | undefined)[], TreeCacheEntry>();

/**
 * Builds the render tree from the flat messages array. Order-robust: live
 * stream/steer/preempt cache writes can momentarily place a child before its
 * parent, and a single-pass link would hoist such rows into phantom root
 * branches — folding the visible thread to one dangling branch until a
 * refetch restores creation order. Linking happens only after every message
 * is indexed, so array order never changes the tree shape.
 */
export function buildTree({
  messages,
  fileMap,
}: {
  messages: (TMessage | undefined)[] | null;
  fileMap?: Record<string, TFile>;
}) {
  if (messages === null) {
    return null;
  }

  const cached = treeCache.get(messages);
  if (cached) {
    if (fileMap == null && cached.bare) {
      return cached.bare;
    }
    if (fileMap != null && cached.fileMap === fileMap && cached.hydrated) {
      return cached.hydrated;
    }
  }

  const messageMap: Record<string, ParentMessage> = {};
  const orderedMessages: ParentMessage[] = [];
  const rootMessages: ParentMessage[] = [];
  const childrenCount: Record<string, number> = {};

  for (const message of messages) {
    if (!message) {
      continue;
    }
    /** A self-parented row can never link under itself (it becomes a root),
     *  so count it with the parentless group — charging its own id would
     *  inflate the sibling indices of its real children past
     *  `children.length`. */
    const parentId =
      message.parentMessageId === message.messageId ? '' : (message.parentMessageId ?? '');
    childrenCount[parentId] = (childrenCount[parentId] || 0) + 1;

    const extendedMessage: ParentMessage = {
      ...message,
      children: [],
      depth: 0,
      siblingIndex: childrenCount[parentId] - 1,
    };

    if (message.files && fileMap) {
      extendedMessage.files = message.files.map((file) => fileMap[file.file_id ?? ''] ?? file);
    }

    messageMap[message.messageId] = extendedMessage;
    orderedMessages.push(extendedMessage);
  }

  for (const extendedMessage of orderedMessages) {
    const parentMessage = messageMap[extendedMessage.parentMessageId ?? ''];
    if (parentMessage && parentMessage !== extendedMessage) {
      parentMessage.children.push(extendedMessage);
    } else {
      rootMessages.push(extendedMessage);
    }
  }

  /** Depth comes from a roots-down walk (a child linked before its parent
   *  can't inherit depth at link time). The `visited` set doubles as the
   *  cycle guard: nodes on a corrupt parent cycle are unreachable from any
   *  root, so they resurface as roots instead of disappearing. */
  const visited = new Set<ParentMessage>();
  const assignDepths = (root: ParentMessage) => {
    visited.add(root);
    const stack: ParentMessage[] = [root];
    while (stack.length > 0) {
      const node = stack.pop() as ParentMessage;
      /** Every node has one parent, so this walk reaches each node once — an
       *  already-visited child is a cycle back-edge. Sever it (not just skip
       *  it) so consumers that recurse `children` terminate. */
      if ((node.children as ParentMessage[]).some((child) => visited.has(child))) {
        node.children = (node.children as ParentMessage[]).filter((child) => !visited.has(child));
      }
      for (const child of node.children as ParentMessage[]) {
        child.depth = node.depth + 1;
        visited.add(child);
        stack.push(child);
      }
    }
  };
  for (const root of rootMessages) {
    assignDepths(root);
  }
  for (const extendedMessage of orderedMessages) {
    if (!visited.has(extendedMessage)) {
      rootMessages.push(extendedMessage);
      assignDepths(extendedMessage);
    }
  }

  const tree = rootMessages as TMessage[];
  const entry = cached ?? {};
  if (fileMap == null) {
    entry.bare = tree;
  } else {
    entry.fileMap = fileMap;
    entry.hydrated = tree;
  }
  if (!cached) {
    treeCache.set(messages, entry);
  }
  return tree;
}
