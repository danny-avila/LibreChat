import { z } from 'zod';
import type { TPreset } from './schemas';
import {
  EModelEndpoint,
  tPresetSchema,
  eModelEndpointSchema,
  AuthType,
  authTypeSchema,
} from './schemas';
import { type TBalanceConfig } from './config';

export type TModelSpec = {
  name: string;
  label: string;
  preset: TPreset;
  balance?: TBalanceConfig;
  order?: number;
  default?: boolean;
  description?: string;
  /**
   * Optional group name for organizing specs in the UI selector.
   * - If it matches an endpoint name (e.g., "openAI", "groq"), the spec appears nested under that endpoint
   * - If it's a custom name (doesn't match any endpoint), it creates a separate collapsible group
   * - If omitted, the spec appears as a standalone item at the top level
   */
  group?: string;
  /**
   * Optional icon URL for the group this spec belongs to.
   * Only needs to be set on one spec per group - the first one found with a groupIcon will be used.
   * Can be a URL or an endpoint name to use its icon.
   */
  groupIcon?: string | EModelEndpoint;
  showIconInMenu?: boolean;
  showIconInHeader?: boolean;
  iconURL?: string | EModelEndpoint; // Allow using project-included icons
  authType?: AuthType;
  webSearch?: boolean;
  fileSearch?: boolean;
  executeCode?: boolean;
  mcpServers?: string[];
};

export const tModelSpecSchema = z.object({
  name: z.string(),
  label: z.string(),
  preset: tPresetSchema,
  balance: z
    .object({
      enabled: z.boolean().optional().default(false),
      startBalance: z.number().optional().default(20000),
      autoRefillEnabled: z.boolean().optional().default(false),
      refillIntervalValue: z.number().optional().default(30),
      refillIntervalUnit: z
        .enum(['seconds', 'minutes', 'hours', 'days', 'weeks', 'months'])
        .optional()
        .default('days'),
      refillAmount: z.number().optional().default(10000),
    })
    .optional(),
  order: z.number().optional(),
  default: z.boolean().optional(),
  description: z.string().optional(),
  group: z.string().optional(),
  groupIcon: z.union([z.string(), eModelEndpointSchema]).optional(),
  showIconInMenu: z.boolean().optional(),
  showIconInHeader: z.boolean().optional(),
  iconURL: z.union([z.string(), eModelEndpointSchema]).optional(),
  authType: authTypeSchema.optional(),
  webSearch: z.boolean().optional(),
  fileSearch: z.boolean().optional(),
  executeCode: z.boolean().optional(),
  mcpServers: z.array(z.string()).optional(),
});

export const specsConfigSchema = z.object({
  enforce: z.boolean().default(false),
  prioritize: z.boolean().default(true),
  list: z.array(tModelSpecSchema).min(1),
  addedEndpoints: z.array(z.union([z.string(), eModelEndpointSchema])).optional(),
});

export type TSpecsConfig = z.infer<typeof specsConfigSchema>;
