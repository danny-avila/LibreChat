import { atom } from 'recoil';
import { atomWithLocalStorage } from './utils';

interface CrawlFormState {
  isVisible: boolean;
  isSubmitted: boolean;
  messageId?: string;
  conversationId?: string;
  formData?: {
    website: string;
    launchDate: string;
    description: string;
  };
  submittedData?: {
    website: string;
    launchDate: string;
    description: string;
    websiteLabel?: string;
  };
}

// Generic form data interface
interface FormData {
  [key: string]: string | boolean;
}

// Store submitted forms by their unique identifier (message content hash)
export const submittedFormsState = atomWithLocalStorage<
  Record<
    string,
    {
      isSubmitted: boolean;
      isCancelled?: boolean;
      toolName?: string;
      serverName?: string;
      requestId?: string;
      options?: any[];
      output?: string;
      formType?: string;
      submittedData?: FormData;
    }
  >
>('submittedFormsState', {});

export const crawlFormState = atom<CrawlFormState>({
  key: 'crawlFormState',
  default: {
    isVisible: false,
    isSubmitted: false,
  },
});

// Store chat blocking state by conversation ID
export const isChatBlockedState = atomWithLocalStorage<Record<string, boolean>>(
  'isChatBlockedState',
  {},
);
