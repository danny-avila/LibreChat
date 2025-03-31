import { z } from 'zod';
import type { TPreset } from './schemas';
import {
  EModelEndpoint,
  tPresetSchema,
  eModelEndpointSchema,
  AuthType,
  authTypeSchema,
} from './schemas';

export type ModelCapabilityType = 'reasoning' | 'upload_image' | 'web_search' | 'experimental' | 'deep_research';

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
  iconCapabilities?: ModelCapabilityType[];
  badges?: {
    disabled?: boolean;         // Disable all badges for this model
    inputPrice?: number;        // Input price per million tokens
    outputPrice?: number;       // Output price per million tokens
    showPricing?: boolean;      // Whether to show the pricing badges
    isFree?: boolean;           // Whether the model is completely free to use
    maxContextToken?: number;   // Maximum context window size in tokens
  };
};

// Define badges schema for validation
export const badgesSchema = z.object({
  disabled: z.boolean().optional(),
  inputPrice: z.number().optional(),
  outputPrice: z.number().optional(),
  showPricing: z.boolean().optional(),
  isFree: z.boolean().optional(),
  maxContextToken: z.number().optional(),
});

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
  iconCapabilities: z.array(z.enum(['reasoning', 'upload_image', 'web_search', 'experimental', 'deep_research'])).optional(),
  badges: badgesSchema.optional(),
});

export const specsConfigSchema = z.object({
  enforce: z.boolean().default(false),
  prioritize: z.boolean().default(true),
  list: z.array(tModelSpecSchema).min(1),
});

export type TSpecsConfig = z.infer<typeof specsConfigSchema>;
