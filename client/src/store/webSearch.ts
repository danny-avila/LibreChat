import { atomFamily } from 'recoil';
import type { WebSearchStatus } from '~/common';

export const webSearchStatusFamily = atomFamily<WebSearchStatus[], string>({
  key: 'webSearchStatusFamily',
  default: [],
});

export default {
  webSearchStatusFamily,
};
