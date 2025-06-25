import { z } from 'zod';
import { AuthKeys, googleBaseSchema } from 'librechat-data-provider';

export type GoogleParameters = z.infer<typeof googleBaseSchema>;

export type GoogleCredentials = {
  [AuthKeys.GOOGLE_SERVICE_KEY]?: string;
  [AuthKeys.GOOGLE_API_KEY]?: string;
};

/**
 * Configuration options for the getLLMConfig function
 */
export interface GoogleConfigOptions {
  modelOptions?: Partial<GoogleParameters>;
  reverseProxyUrl?: string;
  defaultQuery?: Record<string, string | undefined>;
  headers?: Record<string, string>;
  proxy?: string;
  streaming?: boolean;
  authHeader?: boolean;
  addParams?: Record<string, unknown>;
  dropParams?: string[];
}
