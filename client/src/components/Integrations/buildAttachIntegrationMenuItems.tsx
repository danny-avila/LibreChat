import { isIntegrationConnected } from 'librechat-data-provider';
import type { IntegrationProviderKey, IntegrationProviderStatus } from 'librechat-data-provider';
import type { MenuItemProps } from '~/common';
import { INTEGRATION_LABEL_KEYS } from '~/constants/integrations';
import { INTEGRATION_ATTACH_MENU } from './attachMenu';
import { IntegrationProviderIcon } from './IntegrationProviderIcon';

type IntegrationPickerKey = IntegrationProviderKey | 'microsoft-mail' | 'microsoft-calendar';

type LocalizeFn = (key: string, params?: Record<string, string | number | undefined>) => string;

export interface BuildAttachIntegrationMenuItemsOptions {
  integrations: IntegrationProviderStatus[];
  createFileTypeSubItems: (openPicker: () => void) => MenuItemProps[];
  localize: LocalizeFn;
  closeAttachMenu: () => void;
  setActiveIntegrationPicker: (picker: IntegrationPickerKey) => void;
  setConnectPromptProvider: (providerKey: IntegrationProviderKey) => void;
  openDrivePicker: () => void;
  openDropboxPicker: () => void;
  openBoxPicker: () => void;
  openClioPicker: () => void;
  openMicrosoftOneDrivePicker: () => void;
  openMicrosoftOutlookMailPicker: () => void;
  openMicrosoftOutlookCalendarPicker: () => void;
  setToolResourceContext: () => void;
  showComingSoonToast: () => void;
  onDisconnect: (providerKey: IntegrationProviderKey) => void;
  sharePointItem?: MenuItemProps;
}

function providerIcon(providerKey: IntegrationProviderKey): MenuItemProps['icon'] {
  return <IntegrationProviderIcon providerKey={providerKey} className="size-4" />;
}

function buildDisconnectItem(
  providerKey: IntegrationProviderKey,
  options: BuildAttachIntegrationMenuItemsOptions,
): MenuItemProps {
  const labelKey = INTEGRATION_LABEL_KEYS[providerKey];
  const providerLabel = labelKey ? options.localize(labelKey) : providerKey;
  return {
    id: `disconnect-${providerKey}`,
    label: options.localize('com_integrations_disconnect_provider', { provider: providerLabel }),
    icon: providerIcon(providerKey),
    onClick: () => {
      options.closeAttachMenu();
      options.onDisconnect(providerKey);
    },
  };
}

function withDisconnectItem(
  subItems: MenuItemProps[],
  providerKey: IntegrationProviderKey,
  options: BuildAttachIntegrationMenuItemsOptions,
): MenuItemProps[] {
  if (subItems.length > 0) {
    subItems.push({ separate: true });
  }
  subItems.push(buildDisconnectItem(providerKey, options));
  return subItems;
}

function connectLabel(localize: LocalizeFn, providerKey: IntegrationProviderKey): string {
  const connectKey = CONNECT_LABEL_KEYS[providerKey];
  if (connectKey) {
    return localize(connectKey);
  }
  const config = INTEGRATION_ATTACH_MENU[providerKey];
  if (!config) {
    return providerKey;
  }
  return localize(config.menuLabelKey);
}

const CONNECT_LABEL_KEYS: Partial<Record<IntegrationProviderKey, string>> = {
  'google-drive': 'com_files_connect_google_drive',
  'google-mail': 'com_files_connect_gmail',
  'google-calendar': 'com_files_connect_google_calendar',
  microsoft: 'com_files_upload_microsoft',
  dropbox: 'com_files_upload_dropbox',
  box: 'com_files_upload_box',
  clio: 'com_files_upload_clio',
};

const INTEGRATION_MENU_ORDER: IntegrationProviderKey[] = [
  'google-drive',
  'google-mail',
  'google-calendar',
  'microsoft',
  'dropbox',
  'box',
  'clio',
];

function appendSection(
  items: MenuItemProps[],
  headerKey: string,
  sectionItems: MenuItemProps[],
  localize: LocalizeFn,
): void {
  if (sectionItems.length === 0) {
    return;
  }
  if (items.length > 0) {
    items.push({ separate: true });
  }
  items.push({
    id: `section-${headerKey}`,
    header: true,
    label: localize(headerKey),
  });
  items.push(...sectionItems);
}

function buildConnectItem(
  providerKey: IntegrationProviderKey,
  options: BuildAttachIntegrationMenuItemsOptions,
): MenuItemProps {
  return {
    id: `connect-${providerKey}`,
    label: connectLabel(options.localize, providerKey),
    icon: providerIcon(providerKey),
    onClick: () => {
      options.closeAttachMenu();
      options.setConnectPromptProvider(providerKey);
    },
  };
}

function appendFilePickerSection(
  items: MenuItemProps[],
  sectionId: string,
  sectionLabel: string,
  fileTypeItems: MenuItemProps[],
): void {
  if (fileTypeItems.length === 0) {
    return;
  }

  items.push({
    id: `${sectionId}-header`,
    header: true,
    label: sectionLabel,
  });

  fileTypeItems.forEach((fileItem, fileIndex) => {
    items.push({
      ...fileItem,
      id: fileItem.id ?? `${sectionId}-file-${fileIndex}`,
    });
  });
}

function buildGoogleConnectedSubmenu(
  isDriveConnected: boolean,
  isMailConnected: boolean,
  isCalendarConnected: boolean,
  options: BuildAttachIntegrationMenuItemsOptions,
): MenuItemProps[] {
  const subItems: MenuItemProps[] = [];

  if (isDriveConnected) {
    appendFilePickerSection(
      subItems,
      'integration-google-drive',
      options.localize('com_files_from_google_drive'),
      options.createFileTypeSubItems(options.openDrivePicker),
    );
  }

  if (isMailConnected) {
    subItems.push({
      id: 'integration-google-mail',
      label: options.localize('com_files_from_gmail'),
      icon: providerIcon('google-mail'),
      onClick: () => {
        options.setToolResourceContext();
        options.closeAttachMenu();
        options.setActiveIntegrationPicker('google-mail');
      },
    });
  }

  if (isCalendarConnected) {
    subItems.push({
      id: 'integration-google-calendar',
      label: options.localize('com_files_from_google_calendar'),
      icon: providerIcon('google-calendar'),
      onClick: () => {
        options.setToolResourceContext();
        options.closeAttachMenu();
        options.setActiveIntegrationPicker('google-calendar');
      },
    });
  }

  const disconnectItems: MenuItemProps[] = [];
  if (isDriveConnected) {
    disconnectItems.push(buildDisconnectItem('google-drive', options));
  }
  if (isMailConnected) {
    disconnectItems.push(buildDisconnectItem('google-mail', options));
  }
  if (isCalendarConnected) {
    disconnectItems.push(buildDisconnectItem('google-calendar', options));
  }
  if (disconnectItems.length > 0) {
    if (subItems.length > 0) {
      subItems.push({ separate: true });
    }
    subItems.push(...disconnectItems);
  }

  return subItems;
}

function buildMicrosoftConnectedSubmenu(
  options: BuildAttachIntegrationMenuItemsOptions,
): MenuItemProps[] {
  const subItems: MenuItemProps[] = [];

  appendFilePickerSection(
    subItems,
    'integration-microsoft-onedrive',
    options.localize('com_files_from_microsoft_onedrive'),
    options.createFileTypeSubItems(options.openMicrosoftOneDrivePicker),
  );

  subItems.push(
    {
      id: 'integration-microsoft-mail',
      label: options.localize('com_files_from_outlook_mail'),
      icon: providerIcon('microsoft'),
      onClick: options.openMicrosoftOutlookMailPicker,
    },
    {
      id: 'integration-microsoft-calendar',
      label: options.localize('com_files_from_outlook_calendar'),
      icon: providerIcon('microsoft'),
      onClick: options.openMicrosoftOutlookCalendarPicker,
    },
  );

  return withDisconnectItem(subItems, 'microsoft', options);
}

export function buildAttachIntegrationMenuItems(
  options: BuildAttachIntegrationMenuItemsOptions,
): MenuItemProps[] {
  const enabledIntegrations = options.integrations.filter((integration) => integration.enabled);
  const statusByKey = new Map(
    enabledIntegrations.map((integration) => [integration.providerKey, integration.status]),
  );

  const isEnabled = (providerKey: IntegrationProviderKey): boolean => statusByKey.has(providerKey);
  const isConnected = (providerKey: IntegrationProviderKey): boolean =>
    isIntegrationConnected(statusByKey.get(providerKey));

  const cloudItems: MenuItemProps[] = [];

  const googleConnected =
    isConnected('google-drive') || isConnected('google-mail') || isConnected('google-calendar');
  const googleSubmenu = buildGoogleConnectedSubmenu(
    isConnected('google-drive'),
    isConnected('google-mail'),
    isConnected('google-calendar'),
    options,
  );

  if (googleConnected && googleSubmenu.length > 0) {
    cloudItems.push({
      id: 'integration-google',
      label: options.localize('com_attach_menu_google'),
      icon: providerIcon('google-drive'),
      onClick: () => {},
      subItems: googleSubmenu,
    });
  }

  if (isConnected('microsoft')) {
    cloudItems.push({
      id: 'integration-microsoft',
      label: options.localize('com_attach_menu_microsoft'),
      icon: providerIcon('microsoft'),
      onClick: () => {},
      subItems: buildMicrosoftConnectedSubmenu(options),
    });
  }

  if (isConnected('dropbox')) {
    cloudItems.push({
      id: 'integration-dropbox',
      label: options.localize('com_files_from_dropbox'),
      icon: providerIcon('dropbox'),
      onClick: () => {},
      subItems: withDisconnectItem(
        options.createFileTypeSubItems(options.openDropboxPicker),
        'dropbox',
        options,
      ),
    });
  }

  if (isConnected('box')) {
    cloudItems.push({
      id: 'integration-box',
      label: options.localize('com_files_from_box'),
      icon: providerIcon('box'),
      onClick: () => {},
      subItems: withDisconnectItem(
        options.createFileTypeSubItems(options.openBoxPicker),
        'box',
        options,
      ),
    });
  }

  if (isConnected('clio')) {
    cloudItems.push({
      id: 'integration-clio',
      label: options.localize('com_files_from_clio'),
      icon: providerIcon('clio'),
      onClick: () => {},
      subItems: withDisconnectItem(
        options.createFileTypeSubItems(options.openClioPicker),
        'clio',
        options,
      ),
    });
  }

  if (options.sharePointItem) {
    cloudItems.push(options.sharePointItem);
  }

  for (const providerKey of INTEGRATION_MENU_ORDER) {
    if (isEnabled(providerKey) && !isConnected(providerKey)) {
      cloudItems.push(buildConnectItem(providerKey, options));
    }
  }

  const menuItems: MenuItemProps[] = [];

  appendSection(menuItems, 'com_attach_menu_section_cloud', cloudItems, options.localize);

  return menuItems;
}

export type { IntegrationPickerKey };
