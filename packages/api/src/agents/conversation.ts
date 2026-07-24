export interface ConversationAnchorSource {
  createdAt?: Date | string | number | null;
}

export interface ConversationAnchor<TConversation extends ConversationAnchorSource> {
  createdAt: string;
  conversation: TConversation | null | undefined;
}

interface ResolveConversationAnchorOptions<TConversation extends ConversationAnchorSource> {
  isNewConversation: boolean;
  loadConversation: () => Promise<TConversation | null | undefined>;
  now?: () => Date;
  onLoadError?: (error: Error) => void;
}

function toValidISOString(value: Date | string | number | null | undefined): string | undefined {
  if (value == null) {
    return;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function resolveConversationAnchor<TConversation extends ConversationAnchorSource>({
  isNewConversation,
  loadConversation,
  now = () => new Date(),
  onLoadError,
}: ResolveConversationAnchorOptions<TConversation>): Promise<ConversationAnchor<TConversation>> {
  if (isNewConversation) {
    return {
      createdAt: now().toISOString(),
      conversation: undefined,
    };
  }

  try {
    const conversation = await loadConversation();
    return {
      createdAt: toValidISOString(conversation?.createdAt) ?? now().toISOString(),
      conversation,
    };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    onLoadError?.(normalizedError);
    return {
      createdAt: now().toISOString(),
      conversation: undefined,
    };
  }
}
