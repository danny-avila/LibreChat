import { apiBaseUrl } from 'librechat-data-provider';

export const buildShareLinkUrl = (shareId: string): string => {
  const baseURL = apiBaseUrl();
  return new URL(`${baseURL}/share/${shareId}`, window.location.origin).toString();
};
