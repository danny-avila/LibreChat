import type { TPreset } from './schemas';
import { EModelEndpoint } from './schemas';
import { AuthType } from './config';

export type TModelSpec = {
  name: string;
  label: string;
  preset: TPreset;
  description?: string;
  iconURL: string | EModelEndpoint; // Allow using project-included icons
  authType: AuthType;
};
