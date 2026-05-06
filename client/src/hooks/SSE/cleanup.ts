import { Constants } from 'librechat-data-provider';

export function shouldResetSubagentAtomsOnConversationChange(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean {
  if (previous == null || previous === next) return false;
  return previous !== Constants.NEW_CONVO;
}
