import type { ComponentType } from 'react';
import { Calendar, Mail } from 'lucide-react';
import { GoogleMinimalIcon } from '@librechat/client';
import type { IntegrationProviderKey } from 'librechat-data-provider';

type AttachMenuIcon = ComponentType<{ className?: string }>;

export const INTEGRATION_ATTACH_MENU: Partial<
  Record<IntegrationProviderKey, { menuLabelKey: string; Icon: AttachMenuIcon }>
> = {
  'google-drive': {
    menuLabelKey: 'com_files_upload_google_drive',
    Icon: GoogleMinimalIcon,
  },
  'google-mail': {
    menuLabelKey: 'com_files_upload_google_mail',
    Icon: Mail,
  },
  'google-calendar': {
    menuLabelKey: 'com_files_upload_google_calendar',
    Icon: Calendar,
  },
};

export const INTEGRATION_ATTACH_PROVIDER_KEYS = Object.keys(
  INTEGRATION_ATTACH_MENU,
) as IntegrationProviderKey[];
