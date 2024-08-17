import { LocalStorageKeys } from 'librechat-data-provider';

export default function getLocalStorageItems() {
  const items = {
    lastSelectedModel: localStorage.getItem(LocalStorageKeys.LAST_MODEL),
    lastSelectedTools: localStorage.getItem(LocalStorageKeys.LAST_TOOLS),
    lastBingSettings: localStorage.getItem(LocalStorageKeys.LAST_BING),
    lastConversationSetup: localStorage.getItem(LocalStorageKeys.LAST_CONVO_SETUP + '_0'),
  };

  const lastSelectedModel = items.lastSelectedModel ? JSON.parse(items.lastSelectedModel) : {};
  const lastSelectedTools = items.lastSelectedTools ? JSON.parse(items.lastSelectedTools) : [];
  const lastBingSettings = items.lastBingSettings ? JSON.parse(items.lastBingSettings) : {};
  const lastConversationSetup = items.lastConversationSetup
    ? JSON.parse(items.lastConversationSetup)
    : {};

  return {
    lastSelectedModel,
    lastSelectedTools,
    lastBingSettings,
    lastConversationSetup,
  };
}
