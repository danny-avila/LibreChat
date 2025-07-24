import type { ElicitationState } from 'librechat-data-provider';
import { atom } from 'recoil';

export interface ActiveElicitation {
  id: string;
  tool_call_id?: string;
  timestamp: number;
}

/**
 * Stores active elicitations keyed by tool_call_id
 * This allows the UI to show elicitations only for specific tool calls
 */
export const activeElicitationsState = atom<Record<string, ActiveElicitation>>({
  key: 'activeElicitations',
  default: {},
});

/**
 * Stores detailed elicitation data keyed by elicitation ID
 */
export const elicitationDataState = atom<Record<string, ElicitationState>>({
  key: 'elicitationData',
  default: {},
});
