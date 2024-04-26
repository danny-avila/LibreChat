import type { TPreset } from './schemas';
import { EModelEndpoint } from './schemas';
import { AuthType } from './config';

export type TModelSpec = {
  name: string;
  label: string;
  preset: TPreset;
  order?: number;
  default?: boolean;
  description?: string;
  showIconInMenu?: boolean;
  showIconInHeader?: boolean;
  iconURL: string | EModelEndpoint; // Allow using project-included icons
  authType: AuthType;
};
