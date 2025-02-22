import { z } from 'zod';
import type { TPreset } from './schemas';
import {
  EModelEndpoint,
  tPresetSchema,
  eModelEndpointSchema,
  AuthType,
  authTypeSchema,
} from './schemas';

export type TModelSpec = {
  name: string;
  label: string;
  preset: TPreset;
  order?: number;
  default?: boolean;
  description?: string;
  showIconInMenu?: boolean;
  showIconInHeader?: boolean;
  iconURL?: string | EModelEndpoint; // Allow using project-included icons
  authType?: AuthType;
  groups?: Array<string>; // List of group ObjectIds allowed to access this model
  // badgeIcon?: string; // URL to badge icon for visual categorization
  // badgeTooltip?: string; // Tooltip text for the badge
};

export const tModelSpecSchema = z.object({
  name: z.string(),
  label: z.string(),
  preset: tPresetSchema,
  order: z.number().optional(),
  default: z.boolean().optional(),
  description: z.string().optional(),
  showIconInMenu: z.boolean().optional(),
  showIconInHeader: z.boolean().optional(),
  iconURL: z.union([z.string(), eModelEndpointSchema]).optional(),
  authType: authTypeSchema.optional(),
  groups: z.array(z.string()).optional(),
  // badgeIcon: z.string().url('Must be a valid URL').optional(),
  // badgeTooltip: z.string().optional(),
});

export const specsConfigSchema = z.object({
  enforce: z.boolean().default(false),
  prioritize: z.boolean().default(true),
  list: z.array(tModelSpecSchema).min(1),
});

export type TSpecsConfig = z.infer<typeof specsConfigSchema>;
