import type { IntegrationProviderKey } from 'librechat-data-provider';
import type { MenuItemProps } from '~/common';
import type { IntegrationPickerOpeners } from '~/hooks/integrations/useIntegrationPickers';
import { IntegrationProviderIcon } from './IntegrationProviderIcon';

type LocalizeFn = ReturnType<typeof import('~/hooks/useLocalize').default>;

export interface RowAttachMenuOptions {
  createFileTypeSubItems: (openPicker: () => void) => MenuItemProps[];
  localize: LocalizeFn;
  openers: IntegrationPickerOpeners;
}

/**
 * Attach action for a single connected provider row in the integrations sidebar.
 * `direct` opens the picker immediately (single target); `menu` requires a
 * dropdown of options (file-type selection or multiple targets).
 */
export type RowAttachMenu =
  | { kind: 'direct'; open: () => void }
  | { kind: 'menu'; items: MenuItemProps[] };

function providerIcon(providerKey: IntegrationProviderKey): MenuItemProps['icon'] {
  return <IntegrationProviderIcon providerKey={providerKey} className="size-4" />;
}

function buildMicrosoftMenuItems(options: RowAttachMenuOptions): MenuItemProps[] {
  const { localize, openers, createFileTypeSubItems } = options;
  return [
    {
      id: 'integration-microsoft-onedrive',
      label: localize('com_files_from_microsoft_onedrive'),
      icon: providerIcon('microsoft'),
      onClick: () => {},
      subItems: createFileTypeSubItems(openers.openMicrosoftOneDrivePicker),
    },
    {
      id: 'integration-microsoft-mail',
      label: localize('com_files_from_outlook_mail'),
      icon: providerIcon('microsoft'),
      onClick: openers.openMicrosoftOutlookMailPicker,
    },
    {
      id: 'integration-microsoft-calendar',
      label: localize('com_files_from_outlook_calendar'),
      icon: providerIcon('microsoft'),
      onClick: openers.openMicrosoftOutlookCalendarPicker,
    },
  ];
}

/**
 * Returns the attach action for a connected provider row, or `null` when the
 * provider has no picker (e.g. QuickBooks).
 */
export function getRowAttachMenu(
  providerKey: IntegrationProviderKey,
  options: RowAttachMenuOptions,
): RowAttachMenu | null {
  const { openers, createFileTypeSubItems } = options;

  switch (providerKey) {
    case 'google-drive':
      return { kind: 'menu', items: createFileTypeSubItems(openers.openDrivePicker) };
    case 'dropbox':
      return { kind: 'menu', items: createFileTypeSubItems(openers.openDropboxPicker) };
    case 'box':
      return { kind: 'menu', items: createFileTypeSubItems(openers.openBoxPicker) };
    case 'clio':
      return { kind: 'menu', items: createFileTypeSubItems(openers.openClioPicker) };
    case 'microsoft':
      return { kind: 'menu', items: buildMicrosoftMenuItems(options) };
    case 'google-mail':
      return { kind: 'direct', open: openers.openGmailPicker };
    case 'google-calendar':
      return { kind: 'direct', open: openers.openCalendarPicker };
    default:
      return null;
  }
}
