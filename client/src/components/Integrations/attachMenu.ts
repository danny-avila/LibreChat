import type { ComponentType } from 'react';
import { Briefcase, Calendar, LayoutGrid, Mail, Package } from 'lucide-react';
import { GoogleMinimalIcon } from '@librechat/client';
import type { IntegrationProviderKey } from 'librechat-data-provider';

type AttachMenuIcon = ComponentType<{ className?: string }>;

export const INTEGRATION_PICKER_PROVIDER_KEYS = new Set<IntegrationProviderKey>([
  'google-drive',
  'google-mail',
  'google-calendar',
  'dropbox',
  'microsoft',
  'box',
  'clio',
]);

export const INTEGRATION_ATTACH_MENU: Partial<
  Record<
    IntegrationProviderKey,
    { menuLabelKey: string; connectedMenuLabelKey?: string; Icon: AttachMenuIcon }
  >
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
  microsoft: {
    menuLabelKey: 'com_files_upload_microsoft',
    connectedMenuLabelKey: 'com_files_from_microsoft',
    Icon: LayoutGrid,
  },
  dropbox: {
    menuLabelKey: 'com_files_upload_dropbox',
    connectedMenuLabelKey: 'com_files_from_dropbox',
    Icon: Package,
  },
  box: {
    menuLabelKey: 'com_files_upload_box',
    connectedMenuLabelKey: 'com_files_from_box',
    Icon: Package,
  },
  clio: {
    menuLabelKey: 'com_files_upload_clio',
    connectedMenuLabelKey: 'com_files_from_clio',
    Icon: Briefcase,
  },
};

export const INTEGRATION_ATTACH_PROVIDER_KEYS = Object.keys(
  INTEGRATION_ATTACH_MENU,
) as IntegrationProviderKey[];

export function getIntegrationAttachMenuLabelKey(
  providerKey: IntegrationProviderKey,
  isConnected: boolean,
): string {
  const config = INTEGRATION_ATTACH_MENU[providerKey];
  if (!config) {
    return '';
  }
  if (isConnected && config.connectedMenuLabelKey) {
    return config.connectedMenuLabelKey;
  }
  return config.menuLabelKey;
}
