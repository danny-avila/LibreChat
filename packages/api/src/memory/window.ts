interface RoleTagged {
  role?: string;
}

/** Last `size` messages, trimmed to open on a user turn. Always ends at the newest message. */
export function selectMemoryWindow<T extends RoleTagged>(
  messages: readonly T[],
  size: number,
): T[] {
  if (messages.length <= size) {
    return [...messages];
  }
  const start = messages.length - size;
  for (let i = start; i < messages.length; i++) {
    if (messages[i]?.role === 'user') {
      return messages.slice(i);
    }
  }
  return messages.slice(start);
}
