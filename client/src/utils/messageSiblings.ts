import type { TMessage } from 'librechat-data-provider';

function branchDepth(message: TMessage | undefined): number {
  if (!message?.children?.length) {
    return 0;
  }
  let maxChildDepth = 0;
  for (const child of message.children) {
    maxChildDepth = Math.max(maxChildDepth, branchDepth(child as TMessage));
  }
  return maxChildDepth + 1;
}

export function messageHasVisibleContent(message: TMessage | undefined): boolean {
  if (!message) {
    return false;
  }

  if (typeof message.text === 'string' && message.text.trim().length > 0) {
    return true;
  }

  if (!Array.isArray(message.content) || message.content.length === 0) {
    return false;
  }

  return message.content.some((part) => {
    if (part?.type === 'text' && typeof part.text === 'string') {
      return part.text.trim().length > 0;
    }
    if (part?.type === 'think') {
      return false;
    }
    return part != null;
  });
}

function branchScore(message: TMessage | undefined): number {
  if (!message) {
    return 0;
  }
  const depth = branchDepth(message);
  const visible = messageHasVisibleContent(message) ? 1 : 0;
  const userWithChildren = message.isCreatedByUser && depth > 0 ? 2 : 0;
  return depth * 10 + userWithChildren + visible;
}

/** Drops sibling branches that are empty user-only stubs from broken job trees. */
export function filterSiblingMessages(messagesTree: TMessage[]): TMessage[] {
  if (messagesTree.length <= 1) {
    return messagesTree;
  }

  const filtered = messagesTree.filter((message) => {
    if (!message.isCreatedByUser) {
      return true;
    }
    return branchDepth(message) > 0 || messageHasVisibleContent(message);
  });

  return filtered.length > 0 ? filtered : messagesTree;
}

/** Internal sibling index for the branch that best represents the conversation. */
export function preferredSiblingIndex(messagesTree: TMessage[]): number {
  const siblings = filterSiblingMessages(messagesTree);
  if (siblings.length <= 1) {
    return 0;
  }

  let bestInternalIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < siblings.length; i++) {
    const score = branchScore(siblings[i]);
    if (score >= bestScore) {
      bestScore = score;
      bestInternalIdx = siblings.length - i - 1;
    }
  }

  return bestInternalIdx;
}
