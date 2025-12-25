import { atom } from 'jotai';

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  maxContext: number | null; // null = N/A
};

export const tokenUsageAtom = atom<TokenUsage>({
  inputTokens: 0,
  outputTokens: 0,
  maxContext: null,
});
