export default function getLocalStorageItems() {
  const items = {
    lastSelectedModel: localStorage.getItem('lastSelectedModel'),
    lastSelectedTools: localStorage.getItem('lastSelectedTools'),
    lastBingSettings: localStorage.getItem('lastBingSettings'),
    lastConversationSetup: localStorage.getItem('lastConversationSetup'),
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
