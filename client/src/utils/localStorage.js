import { LocalStorageKeys } from 'librechat-data-provider';
export function getLocalStorageItems() {
    const items = {
        lastSelectedModel: localStorage.getItem(LocalStorageKeys.LAST_MODEL) ?? '',
        lastSelectedTools: localStorage.getItem(LocalStorageKeys.LAST_TOOLS) ?? '',
        lastConversationSetup: localStorage.getItem(LocalStorageKeys.LAST_CONVO_SETUP + '_0') ?? '',
    };
    const lastSelectedModel = items.lastSelectedModel
        ? JSON.parse(items.lastSelectedModel)
        : {};
    const lastSelectedTools = items.lastSelectedTools
        ? JSON.parse(items.lastSelectedTools)
        : [];
    const lastConversationSetup = items.lastConversationSetup
        ? JSON.parse(items.lastConversationSetup)
        : {};
    return {
        lastSelectedModel,
        lastSelectedTools,
        lastConversationSetup,
    };
}
export function clearLocalStorage(skipFirst) {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
        if (skipFirst === true && key.endsWith('0')) {
            return;
        }
        if (key.startsWith(LocalStorageKeys.ASST_ID_PREFIX) ||
            key.startsWith(LocalStorageKeys.AGENT_ID_PREFIX) ||
            key.startsWith(LocalStorageKeys.LAST_CONVO_SETUP) ||
            key === LocalStorageKeys.LAST_SPEC ||
            key === LocalStorageKeys.LAST_TOOLS ||
            key === LocalStorageKeys.LAST_MODEL ||
            key === LocalStorageKeys.FILES_TO_DELETE) {
            localStorage.removeItem(key);
        }
    });
}
