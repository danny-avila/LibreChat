import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ShortcutOverride } from '~/store/misc';
import type { ShortcutBinding } from '~/utils/shortcuts';
import { useArchiveConvoMutation, useDeleteConversationMutation } from '~/data-provider';
import {
  bindingDisplayString,
  bindingFromEvent,
  bindingHash,
  bindingToString,
  isMacPlatform,
  parseBinding,
} from '~/utils/shortcuts';
import { mainTextareaId } from '~/common';
import { clearMessagesCache } from '~/utils';
import useNewConvo from './useNewConvo';
import store from '~/store';

const isMac = isMacPlatform;
const CUSTOM_STORAGE_KEY = 'customKeyboardShortcuts';

export type ShortcutDefinition = {
  labelKey: string;
  groupKey: string;
  displayMac: string;
  displayOther: string;
  ariaMac: string;
  ariaOther: string;
};

export const shortcutDefinitions = {
  showShortcuts: {
    labelKey: 'com_shortcut_show_shortcuts',
    groupKey: 'com_shortcut_group_general',
    displayMac: '⌘ ⇧ /',
    displayOther: 'Ctrl+Shift+/',
    ariaMac: 'Meta+Shift+/',
    ariaOther: 'Control+Shift+/',
  },
  newChat: {
    labelKey: 'com_ui_new_chat',
    groupKey: 'com_shortcut_group_general',
    displayMac: '⌘ ⇧ O',
    displayOther: 'Ctrl+Shift+O',
    ariaMac: 'Meta+Shift+O',
    ariaOther: 'Control+Shift+O',
  },
  focusChat: {
    labelKey: 'com_shortcut_focus_chat_input',
    groupKey: 'com_shortcut_group_general',
    displayMac: '⇧ Esc',
    displayOther: 'Shift+Esc',
    ariaMac: 'Shift+Escape',
    ariaOther: 'Shift+Escape',
  },
  copyLastResponse: {
    labelKey: 'com_shortcut_copy_last_response',
    groupKey: 'com_shortcut_group_general',
    displayMac: '⌘ ⇧ ;',
    displayOther: 'Ctrl+Shift+;',
    ariaMac: 'Meta+Shift+;',
    ariaOther: 'Control+Shift+;',
  },
  uploadFile: {
    labelKey: 'com_shortcut_upload_file',
    groupKey: 'com_shortcut_group_general',
    displayMac: '⌘ ⇧ U',
    displayOther: 'Ctrl+Shift+U',
    ariaMac: 'Meta+Shift+U',
    ariaOther: 'Control+Shift+U',
  },
  toggleSidebar: {
    labelKey: 'com_shortcut_toggle_sidebar',
    groupKey: 'com_shortcut_group_navigation',
    displayMac: '⌘ ⇧ S',
    displayOther: 'Ctrl+Shift+S',
    ariaMac: 'Meta+Shift+S',
    ariaOther: 'Control+Shift+S',
  },
  toggleRightSidebar: {
    labelKey: 'com_shortcut_toggle_right_sidebar',
    groupKey: 'com_shortcut_group_navigation',
    displayMac: '⌘ ⇧ R',
    displayOther: 'Ctrl+Shift+R',
    ariaMac: 'Meta+Shift+R',
    ariaOther: 'Control+Shift+R',
  },
  openModelSelector: {
    labelKey: 'com_shortcut_open_model_selector',
    groupKey: 'com_shortcut_group_navigation',
    displayMac: '⌘ ⇧ M',
    displayOther: 'Ctrl+Shift+M',
    ariaMac: 'Meta+Shift+M',
    ariaOther: 'Control+Shift+M',
  },
  focusSearch: {
    labelKey: 'com_shortcut_focus_search',
    groupKey: 'com_shortcut_group_navigation',
    displayMac: '⌘ /',
    displayOther: 'Ctrl+/',
    ariaMac: 'Meta+/',
    ariaOther: 'Control+/',
  },
  openSettings: {
    labelKey: 'com_nav_settings',
    groupKey: 'com_shortcut_group_navigation',
    displayMac: '⌘ ⇧ ,',
    displayOther: 'Ctrl+Shift+,',
    ariaMac: 'Meta+Shift+,',
    ariaOther: 'Control+Shift+,',
  },
  stopGenerating: {
    labelKey: 'com_nav_stop_generating',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ X',
    displayOther: 'Ctrl+Shift+X',
    ariaMac: 'Meta+Shift+X',
    ariaOther: 'Control+Shift+X',
  },
  regenerateResponse: {
    labelKey: 'com_shortcut_regenerate_response',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ E',
    displayOther: 'Ctrl+Shift+E',
    ariaMac: 'Meta+Shift+E',
    ariaOther: 'Control+Shift+E',
  },
  editLastMessage: {
    labelKey: 'com_shortcut_edit_last_message',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ I',
    displayOther: 'Ctrl+Shift+I',
    ariaMac: 'Meta+Shift+I',
    ariaOther: 'Control+Shift+I',
  },
  copyLastCode: {
    labelKey: 'com_shortcut_copy_last_code',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ K',
    displayOther: 'Ctrl+Shift+K',
    ariaMac: 'Meta+Shift+K',
    ariaOther: 'Control+Shift+K',
  },
  scrollToTop: {
    labelKey: 'com_shortcut_scroll_to_top',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ ↑',
    displayOther: 'Ctrl+Shift+↑',
    ariaMac: 'Meta+Shift+ArrowUp',
    ariaOther: 'Control+Shift+ArrowUp',
  },
  scrollToBottom: {
    labelKey: 'com_shortcut_scroll_to_bottom',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ ↓',
    displayOther: 'Ctrl+Shift+↓',
    ariaMac: 'Meta+Shift+ArrowDown',
    ariaOther: 'Control+Shift+ArrowDown',
  },
  toggleTemporaryChat: {
    labelKey: 'com_ui_temporary',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ T',
    displayOther: 'Ctrl+Shift+T',
    ariaMac: 'Meta+Shift+T',
    ariaOther: 'Control+Shift+T',
  },
  archiveConversation: {
    labelKey: 'com_shortcut_archive_conversation',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ A',
    displayOther: 'Ctrl+Shift+A',
    ariaMac: 'Meta+Shift+A',
    ariaOther: 'Control+Shift+A',
  },
  deleteConversation: {
    labelKey: 'com_shortcut_delete_conversation',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ ⌫',
    displayOther: 'Ctrl+Shift+Backspace',
    ariaMac: 'Meta+Shift+Backspace',
    ariaOther: 'Control+Shift+Backspace',
  },
} as const satisfies Record<string, ShortcutDefinition>;

export type ShortcutActionId = keyof typeof shortcutDefinitions;
export type ShortcutAction = ShortcutDefinition & {
  id: ShortcutActionId;
  run: () => void;
};

const shortcutActionIds = Object.keys(shortcutDefinitions) as ShortcutActionId[];

function getMainScrollContainer(): Element | null {
  return document.querySelector('main[role="main"]');
}

function defaultAria(actionId: ShortcutActionId): string {
  const def = shortcutDefinitions[actionId];
  return isMac ? def.ariaMac : def.ariaOther;
}

function readOverridesFromStorage(): Record<string, ShortcutOverride> {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function effectiveBindingString(
  actionId: ShortcutActionId,
  overrides: Record<string, ShortcutOverride>,
): string | null {
  const override = overrides[actionId];
  if (override) {
    const platformValue = isMac ? override.mac : override.other;
    if (platformValue === null) {
      return null;
    }
    if (typeof platformValue === 'string') {
      return platformValue;
    }
  }
  return defaultAria(actionId);
}

export function effectiveBinding(
  actionId: ShortcutActionId,
  overrides?: Record<string, ShortcutOverride>,
): ShortcutBinding | null {
  const map = overrides ?? readOverridesFromStorage();
  return parseBinding(effectiveBindingString(actionId, map));
}

export function getShortcutDisplay(actionId: ShortcutActionId): string {
  const binding = effectiveBinding(actionId);
  if (!binding) {
    return '';
  }
  return bindingDisplayString(binding, isMac);
}

export function getShortcutAriaKey(actionId: ShortcutActionId): string {
  const binding = effectiveBinding(actionId);
  if (!binding) {
    return '';
  }
  return bindingToString(binding) ?? '';
}

export function getShortcutHint(actionId: ShortcutActionId, label: string): string {
  const display = getShortcutDisplay(actionId);
  return display ? `${label} (${display})` : label;
}

export function isOverridden(actionId: ShortcutActionId, override?: ShortcutOverride): boolean {
  if (!override) return false;
  const platformValue = isMac ? override.mac : override.other;
  if (platformValue === null) return true;
  if (typeof platformValue !== 'string') return false;
  return platformValue !== defaultAria(actionId);
}

export function useShortcutActions(): ShortcutAction[] {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const { conversationId: currentConvoId } = useParams();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const [sidebarExpanded, setSidebarExpanded] = useRecoilState(store.sidebarExpanded);
  const setShowShortcutsDialog = useSetRecoilState(store.showShortcutsDialog);
  const setIsTemporary = useSetRecoilState(store.isTemporary);

  const archiveMutation = useArchiveConvoMutation();
  const deleteMutation = useDeleteConversationMutation();

  const handleShowShortcuts = useCallback(() => {
    setShowShortcutsDialog((prev) => !prev);
  }, [setShowShortcutsDialog]);

  const handleNewChat = useCallback(() => {
    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    newConversation();
  }, [queryClient, conversation?.conversationId, newConversation]);

  const handleFocusChatInput = useCallback(() => {
    const textarea = document.getElementById(mainTextareaId) as HTMLTextAreaElement | null;
    textarea?.focus();
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setSidebarExpanded((prev) => !prev);
  }, [setSidebarExpanded]);

  const handleToggleRightSidebar = useCallback(() => {
    const btn = document.querySelector<HTMLButtonElement>('[data-testid="parameters-button"]');
    btn?.click();
  }, []);

  const handleOpenModelSelector = useCallback(() => {
    const btn = document.querySelector<HTMLButtonElement>('[data-testid="model-selector-button"]');
    btn?.click();
  }, []);

  const handleFocusSearch = useCallback(() => {
    const focusSearchInput = () => {
      const input = document.querySelector<HTMLInputElement>(
        'input[data-testid="nav-search-input"]',
      );
      input?.focus();
    };

    if (!sidebarExpanded) {
      setSidebarExpanded(true);
      setTimeout(focusSearchInput, 350);
      return;
    }

    focusSearchInput();
  }, [sidebarExpanded, setSidebarExpanded]);

  const handleCopyLastResponse = useCallback(() => {
    const turns = document.querySelectorAll('.agent-turn');
    if (turns.length === 0) {
      return;
    }
    const last = turns[turns.length - 1];
    const markdown = last.querySelector('.markdown');
    const text = (markdown ?? last).textContent ?? '';
    if (text.trim()) {
      navigator.clipboard.writeText(text.trim());
    }
  }, []);

  const handleCopyLastCode = useCallback(() => {
    const blocks = document.querySelectorAll('.agent-turn pre code');
    if (blocks.length === 0) {
      return;
    }
    const last = blocks[blocks.length - 1];
    const text = last.textContent ?? '';
    if (text.trim()) {
      navigator.clipboard.writeText(text.trim());
    }
  }, []);

  const handleStopGenerating = useCallback(() => {
    const btn = document.querySelector<HTMLButtonElement>('[data-testid="stop-generation-button"]');
    btn?.click();
  }, []);

  const handleRegenerateResponse = useCallback(() => {
    const btn = document.querySelector<HTMLButtonElement>(
      '[data-testid="regenerate-generation-button"]',
    );
    btn?.click();
  }, []);

  const handleEditLastMessage = useCallback(() => {
    const userTurns = document.querySelectorAll('.user-turn');
    if (userTurns.length === 0) {
      return;
    }
    const last = userTurns[userTurns.length - 1];
    const editBtn = last.querySelector<HTMLButtonElement>('button[id^="edit-"]');
    editBtn?.click();
  }, []);

  const handleScrollToTop = useCallback(() => {
    const container = getMainScrollContainer();
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleScrollToBottom = useCallback(() => {
    const container = getMainScrollContainer();
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      return;
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }, []);

  const handleOpenSettings = useCallback(() => {
    const btn = document.querySelector<HTMLElement>('[data-testid="nav-user"]');
    if (!btn) {
      return;
    }
    btn.click();
    setTimeout(() => {
      const settingsItem = document.querySelector<HTMLElement>('[data-testid="nav-settings"]');
      settingsItem?.click();
    }, 150);
  }, []);

  const handleToggleTemporaryChat = useCallback(() => {
    setIsTemporary((prev) => !prev);
  }, [setIsTemporary]);

  const handleUploadFile = useCallback(() => {
    const btn =
      document.querySelector<HTMLButtonElement>('#attach-file-menu-button') ??
      document.querySelector<HTMLButtonElement>('#attach-file');
    btn?.click();
  }, []);

  const handleArchiveConversation = useCallback(() => {
    const convoId = conversation?.conversationId;
    if (!convoId || convoId === 'new') {
      return;
    }
    archiveMutation.mutate(
      { conversationId: convoId, isArchived: true },
      {
        onSuccess: () => {
          if (currentConvoId === convoId || currentConvoId === 'new') {
            newConversation();
            navigate('/c/new', { replace: true });
          }
        },
      },
    );
  }, [conversation?.conversationId, currentConvoId, archiveMutation, newConversation, navigate]);

  const handleDeleteConversation = useCallback(() => {
    const convoId = conversation?.conversationId;
    if (!convoId || convoId === 'new') {
      return;
    }
    const messages = queryClient.getQueryData<TMessage[]>([QueryKeys.messages, convoId]);
    const lastMessage = messages?.[messages.length - 1];
    deleteMutation.mutate(
      {
        conversationId: convoId,
        thread_id: lastMessage?.thread_id,
        endpoint: lastMessage?.endpoint,
        source: 'keyboard',
      },
      {
        onSuccess: () => {
          if (currentConvoId === convoId || currentConvoId === 'new') {
            newConversation();
            navigate('/c/new', { replace: true });
          }
        },
      },
    );
  }, [
    conversation?.conversationId,
    currentConvoId,
    queryClient,
    deleteMutation,
    newConversation,
    navigate,
  ]);

  const handlers = useMemo<Record<ShortcutActionId, () => void>>(
    () => ({
      showShortcuts: handleShowShortcuts,
      newChat: handleNewChat,
      focusChat: handleFocusChatInput,
      copyLastResponse: handleCopyLastResponse,
      uploadFile: handleUploadFile,
      toggleSidebar: handleToggleSidebar,
      toggleRightSidebar: handleToggleRightSidebar,
      openModelSelector: handleOpenModelSelector,
      focusSearch: handleFocusSearch,
      openSettings: handleOpenSettings,
      stopGenerating: handleStopGenerating,
      regenerateResponse: handleRegenerateResponse,
      editLastMessage: handleEditLastMessage,
      copyLastCode: handleCopyLastCode,
      scrollToTop: handleScrollToTop,
      scrollToBottom: handleScrollToBottom,
      toggleTemporaryChat: handleToggleTemporaryChat,
      archiveConversation: handleArchiveConversation,
      deleteConversation: handleDeleteConversation,
    }),
    [
      handleShowShortcuts,
      handleNewChat,
      handleFocusChatInput,
      handleCopyLastResponse,
      handleUploadFile,
      handleToggleSidebar,
      handleToggleRightSidebar,
      handleOpenModelSelector,
      handleFocusSearch,
      handleOpenSettings,
      handleStopGenerating,
      handleRegenerateResponse,
      handleEditLastMessage,
      handleCopyLastCode,
      handleScrollToTop,
      handleScrollToBottom,
      handleToggleTemporaryChat,
      handleArchiveConversation,
      handleDeleteConversation,
    ],
  );

  return useMemo(
    () =>
      shortcutActionIds.map((id) => ({
        id,
        ...shortcutDefinitions[id],
        run: handlers[id],
      })),
    [handlers],
  );
}

export function useShortcutDisplay(actionId?: ShortcutActionId): string {
  const overrides = useRecoilValue(store.customShortcuts);
  return useMemo(() => {
    if (!actionId) return '';
    const binding = parseBinding(effectiveBindingString(actionId, overrides));
    return binding ? bindingDisplayString(binding, isMac) : '';
  }, [actionId, overrides]);
}

export function useShortcutAriaKey(actionId?: ShortcutActionId): string | undefined {
  const overrides = useRecoilValue(store.customShortcuts);
  return useMemo(() => {
    if (!actionId) return undefined;
    const binding = parseBinding(effectiveBindingString(actionId, overrides));
    return binding ? (bindingToString(binding) ?? undefined) : undefined;
  }, [actionId, overrides]);
}

export function useShortcutHint(actionId: ShortcutActionId | undefined, label: string): string {
  const display = useShortcutDisplay(actionId);
  return display ? `${label} (${display})` : label;
}

export type ShortcutBindingInfo = {
  id: ShortcutActionId;
  binding: ShortcutBinding | null;
  isCustom: boolean;
  groupKey: string;
  labelKey: string;
};

export function useShortcutBindings(): {
  bindings: ShortcutBindingInfo[];
  bindingMap: Map<string, ShortcutActionId>;
  setBinding: (id: ShortcutActionId, binding: ShortcutBinding | null) => void;
  resetBinding: (id: ShortcutActionId) => void;
  resetAll: () => void;
} {
  const [overrides, setOverrides] = useRecoilState(store.customShortcuts);

  const bindings = useMemo<ShortcutBindingInfo[]>(
    () =>
      shortcutActionIds.map((id) => {
        const def = shortcutDefinitions[id];
        const override = overrides[id];
        const binding = parseBinding(effectiveBindingString(id, overrides));
        return {
          id,
          binding,
          isCustom: isOverridden(id, override),
          groupKey: def.groupKey,
          labelKey: def.labelKey,
        };
      }),
    [overrides],
  );

  const bindingMap = useMemo<Map<string, ShortcutActionId>>(() => {
    const map = new Map<string, ShortcutActionId>();
    for (const info of bindings) {
      if (info.binding) {
        map.set(bindingHash(info.binding), info.id);
      }
    }
    return map;
  }, [bindings]);

  const setBinding = useCallback(
    (id: ShortcutActionId, binding: ShortcutBinding | null) => {
      setOverrides((prev) => {
        const next = { ...prev };
        const platformKey: keyof ShortcutOverride = isMac ? 'mac' : 'other';
        const existing = next[id] ?? { mac: null, other: null };
        const updated: ShortcutOverride = { ...existing };
        const value = binding ? bindingToString(binding) : null;
        updated[platformKey] = value;

        const def = shortcutDefinitions[id];
        const matchesDefault = updated.mac === def.ariaMac && updated.other === def.ariaOther;

        const otherKey: keyof ShortcutOverride = isMac ? 'other' : 'mac';
        if (updated[otherKey] === undefined) {
          updated[otherKey] = isMac ? def.ariaOther : def.ariaMac;
        }

        if (matchesDefault) {
          delete next[id];
        } else {
          next[id] = updated;
        }
        return next;
      });
    },
    [setOverrides],
  );

  const resetBinding = useCallback(
    (id: ShortcutActionId) => {
      setOverrides((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [setOverrides],
  );

  const resetAll = useCallback(() => {
    setOverrides({});
  }, [setOverrides]);

  return { bindings, bindingMap, setBinding, resetBinding, resetAll };
}

export default function useKeyboardShortcuts() {
  const actions = useShortcutActions();
  const overrides = useRecoilValue(store.customShortcuts);

  const actionMap = useMemo(() => new Map(actions.map((action) => [action.id, action])), [actions]);

  const bindingMap = useMemo<Map<string, ShortcutActionId>>(() => {
    const map = new Map<string, ShortcutActionId>();
    for (const id of shortcutActionIds) {
      const binding = parseBinding(effectiveBindingString(id, overrides));
      if (binding) {
        map.set(bindingHash(binding), id);
      }
    }
    return map;
  }, [overrides]);

  const handler = useCallback(
    (e: KeyboardEvent) => {
      const binding = bindingFromEvent(e);
      if (!binding) {
        return;
      }

      const matchedId = bindingMap.get(bindingHash(binding));
      if (!matchedId) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isEditing =
        tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable === true;

      const allowedWhileEditing: ShortcutActionId[] = ['focusChat', 'focusSearch', 'showShortcuts'];
      if (isEditing && !allowedWhileEditing.includes(matchedId)) {
        return;
      }

      e.preventDefault();
      actionMap.get(matchedId)?.run();
    },
    [actionMap, bindingMap],
  );

  useEffect(() => {
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handler]);
}

export { isMac };
