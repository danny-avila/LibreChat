export type TInteractionProvider = 'mock';
export type TInteractionStatus = 'success' | 'error';

export interface IInteraction {
  userId: string;
  conversationId?: string;
  promptLength: number;
  responseLength: number;
  latencyMs: number;
  provider: TInteractionProvider;
  status: TInteractionStatus;
  createdAt?: Date;
  updatedAt?: Date;
}