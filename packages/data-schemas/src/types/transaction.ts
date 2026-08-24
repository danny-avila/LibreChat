export interface TransactionData {
  user: string;
  conversationId: string;
  tokenType: string;
  model?: string;
  serviceTier?: 'default' | 'priority';
  context?: string;
  valueKey?: string;
  rate?: number;
  rawAmount?: number;
  tokenValue?: number;
  inputTokens?: number;
  writeTokens?: number;
  readTokens?: number;
  messageId?: string;
  inputTokenCount?: number;
  rateDetail?: Record<string, number>;
}
