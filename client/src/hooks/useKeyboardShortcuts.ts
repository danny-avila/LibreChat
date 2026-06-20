import { useCallback, useEffect, useMemo } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useMatch, useNavigate } from 'react-router-dom';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import type { ShortcutBinding } from '~/utils/shortcuts';
import type { ShortcutOverride } from '~/store/misc';
import {
  bindingDisplayString,
  bindingFromEvent,
  bindingHash,
  bindingToString,
  isMacPlatform,
  parseBinding,
} from '~/utils/shortcuts';
import { useArchiveConvoMutation, useDeleteConversationMutation } from '~/data-provider';
import { clearMessagesCache } from '~/utils';
import { mainTextareaId } from '~/common';
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
  submitMessage: {
    labelKey: 'com_shortcut_submit_message',
    groupKey: 'com_shortcut_group_general',
    displayMac: '⌘ ↵',
    displayOther: 'Ctrl+Enter',
    ariaMac: 'Meta+Enter',
    ariaOther: 'Control+Enter',
  },
  bookmarkConversation: {
    labelKey: 'com_shortcut_bookmark_conversation',
    groupKey: 'com_shortcut_group_navigation',
    displayMac: '⌘ ⇧ B',
    displayOther: 'Ctrl+Shift+B',
    ariaMac: 'Meta+Shift+B',
    ariaOther: 'Control+Shift+B',
  },
  continueResponse: {
    labelKey: 'com_shortcut_continue_response',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ C',
    displayOther: 'Ctrl+Shift+C',
    ariaMac: 'Meta+Shift+C',
    ariaOther: 'Control+Shift+C',
  },
  readAloudLastResponse: {
    labelKey: 'com_shortcut_read_aloud',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ V',
    displayOther: 'Ctrl+Shift+V',
    ariaMac: 'Meta+Shift+V',
    ariaOther: 'Control+Shift+V',
  },
  openAssistants: {
    labelKey: 'com_shortcut_open_assistants',
    groupKey: 'com_shortcut_group_panels',
    displayMac: '',
    displayOther: '',
    ariaMac: '',
    ariaOther: '',
  },
  openAgents: {
    labelKey: 'com_shortcut_open_agents',
    groupKey: 'com_shortcut_group_panels',
    displayMac: '',
    displayOther: '',
    ariaMac: '',
    ariaOther: '',
  },
  openPrompts: {
    labelKey: 'com_shortcut_open_prompts',
    groupKey: 'com_shortcut_group_panels',
    displayMac: '',
    displayOther: '',
    ariaMac: '',
    ariaOther: '',
  },
  openMemories: {
    labelKey: 'com_shortcut_open_memories',
    groupKey: 'com_shortcut_group_panels',
    displayMac: '',
    displayOther: '',
    ariaMac: '',
    ariaOther: '',
  },
  openParameters: {
    labelKey: 'com_shortcut_open_parameters',
    groupKey: 'com_shortcut_group_panels',
    displayMac: '',
    displayOther: '',
    ariaMac: '',
    ariaOther: '',
  },
  openFiles: {
    labelKey: 'com_shortcut_open_files',
    groupKey: 'com_shortcut_group_panels',
    displayMac: '',
    displayOther: '',
    ariaMac: '',
    ariaOther: '',
  },
  openBookmarks: {
    labelKey: 'com_shortcut_open_bookmarks',
    groupKey: 'com_shortcut_group_panels',
    displayMac: '',
    displayOther: '',
    ariaMac: '',
    ariaOther: '',
  },
  openMCP: {
    labelKey: 'com_shortcut_open_mcp',
    groupKey: 'com_shortcut_group_panels',
    displayMac: '',
    displayOther: '',
    ariaMac: '',
    ariaOther: '',
  },
} as const satisfies Record<string, ShortcutDefinition>;

export type ShortcutActionId = keyof typeof shortcutDefinitions;
export type ShortcutAction = ShortcutDefinition & {
  id: ShortcutActionId;
  run: () => void;
};

const shortcutActionIds = Object.keys(shortcutDefinitions) as ShortcutActionId[];

function getMainScrollContainer(): Element | null {
  const end = document.getElementById('messages-end');
  let node: HTMLElement | null = end?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return document.querySelector('main[role="main"]');
}

function anyModalOpen(): boolean {
  const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
  for (let i = 0; i < dialogs.length; i++) {
    const dialog = dialogs[i];
    if (dialog.hasAttribute('inert')) {
      continue;
    }
    if (dialog.getAttribute('data-state') === 'closed') {
      continue;
    }
    return true;
  }
  return false;
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
  const routeMatch = useMatch('/c/:conversationId');
  const routeConvoId = routeMatch?.params.conversationId ?? null;
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(0));
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

    const panelButton = document.querySelector<HTMLButtonElement>(
      '[data-testid="nav-panel-conversations"]',
    );
    let switchedPanel = false;
    if (panelButton && panelButton.getAttribute('aria-pressed') !== 'true') {
      switchedPanel = true;
      panelButton.click();
    }

    if (!sidebarExpanded) {
      setSidebarExpanded(true);
    }

    if (!sidebarExpanded || switchedPanel) {
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
    if (!routeConvoId) {
      return;
    }
    const hasMessages = Array.isArray(conversation?.messages) && conversation.messages.length >= 1;
    if (hasMessages || isSubmitting) {
      return;
    }
    setIsTemporary((prev) => !prev);
  }, [routeConvoId, conversation?.messages, isSubmitting, setIsTemporary]);

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
    if (routeConvoId !== convoId) {
      return;
    }
    archiveMutation.mutate(
      { conversationId: convoId, isArchived: true },
      {
        onSuccess: () => {
          newConversation();
          navigate('/c/new', { replace: true });
        },
      },
    );
  }, [conversation?.conversationId, routeConvoId, archiveMutation, newConversation, navigate]);

  const handleDeleteConversation = useCallback(() => {
    const convoId = conversation?.conversationId;
    if (!convoId || convoId === 'new') {
      return;
    }
    if (routeConvoId !== convoId) {
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
          newConversation();
          navigate('/c/new', { replace: true });
        },
      },
    );
  }, [
    conversation?.conversationId,
    routeConvoId,
    queryClient,
    deleteMutation,
    newConversation,
    navigate,
  ]);

  const handleSubmitMessage = useCallback(() => {
    const btn = document.querySelector<HTMLButtonElement>('[data-testid="send-button"]');
    if (btn && !btn.disabled) {
      btn.click();
    }
  }, []);

  const handleContinueResponse = useCallback(() => {
    const btn = document.querySelector<HTMLButtonElement>(
      '[data-testid="continue-generation-button"]',
    );
    btn?.click();
  }, []);

  const handleReadAloudLastResponse = useCallback(() => {
    const btn = document.querySelector<HTMLButtonElement>('[data-testid="read-aloud-button"]');
    btn?.click();
  }, []);

  const handleBookmarkConversation = useCallback(() => {
    document.getElementById('bookmark-menu-button')?.click();
  }, []);

  const handleOpenPanel = useCallback(
    (panelId: string) => {
      const activatePanel = () => {
        const btn = document.querySelector<HTMLButtonElement>(
          `[data-testid="nav-panel-${panelId}"]`,
        );
        if (!btn) {
          return;
        }
        if (btn.getAttribute('aria-pressed') !== 'true') {
          btn.click();
        }
      };

      if (!sidebarExpanded) {
        setSidebarExpanded(true);
        setTimeout(activatePanel, 350);
        return;
      }

      activatePanel();
    },
    [sidebarExpanded, setSidebarExpanded],
  );

  const handleOpenAssistants = useCallback(() => handleOpenPanel('assistants'), [handleOpenPanel]);
  const handleOpenAgents = useCallback(() => handleOpenPanel('agents'), [handleOpenPanel]);
  const handleOpenPrompts = useCallback(() => handleOpenPanel('prompts'), [handleOpenPanel]);
  const handleOpenMemories = useCallback(() => handleOpenPanel('memories'), [handleOpenPanel]);
  const handleOpenParameters = useCallback(() => handleOpenPanel('parameters'), [handleOpenPanel]);
  const handleOpenFiles = useCallback(() => handleOpenPanel('files'), [handleOpenPanel]);
  const handleOpenBookmarks = useCallback(() => handleOpenPanel('bookmarks'), [handleOpenPanel]);
  const handleOpenMCP = useCallback(() => handleOpenPanel('mcp-builder'), [handleOpenPanel]);

  const handlers = useMemo<Record<ShortcutActionId, () => void>>(
    () => ({
      showShortcuts: handleShowShortcuts,
      newChat: handleNewChat,
      focusChat: handleFocusChatInput,
      copyLastResponse: handleCopyLastResponse,
      uploadFile: handleUploadFile,
      toggleSidebar: handleToggleSidebar,
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
      submitMessage: handleSubmitMessage,
      bookmarkConversation: handleBookmarkConversation,
      continueResponse: handleContinueResponse,
      readAloudLastResponse: handleReadAloudLastResponse,
      openAssistants: handleOpenAssistants,
      openAgents: handleOpenAgents,
      openPrompts: handleOpenPrompts,
      openMemories: handleOpenMemories,
      openParameters: handleOpenParameters,
      openFiles: handleOpenFiles,
      openBookmarks: handleOpenBookmarks,
      openMCP: handleOpenMCP,
    }),
    [
      handleShowShortcuts,
      handleNewChat,
      handleFocusChatInput,
      handleCopyLastResponse,
      handleUploadFile,
      handleToggleSidebar,
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
      handleSubmitMessage,
      handleBookmarkConversation,
      handleContinueResponse,
      handleReadAloudLastResponse,
      handleOpenAssistants,
      handleOpenAgents,
      handleOpenPrompts,
      handleOpenMemories,
      handleOpenParameters,
      handleOpenFiles,
      handleOpenBookmarks,
      handleOpenMCP,
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
        const def = shortcutDefinitions[id];
        const platformKey: keyof ShortcutOverride = isMac ? 'mac' : 'other';
        const existing = next[id] ?? { mac: def.ariaMac, other: def.ariaOther };
        const updated: ShortcutOverride = { ...existing };
        updated[platformKey] = binding ? bindingToString(binding) : null;

        const matchesDefault = updated.mac === def.ariaMac && updated.other === def.ariaOther;

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

        const restored = parseBinding(effectiveBindingString(id, next));
        if (restored) {
          const restoredHash = bindingHash(restored);
          const platformKey: keyof ShortcutOverride = isMac ? 'mac' : 'other';
          for (const otherId of Object.keys(next) as ShortcutActionId[]) {
            const otherBinding = parseBinding(effectiveBindingString(otherId, next));
            if (otherBinding && bindingHash(otherBinding) === restoredHash) {
              next[otherId] = { ...next[otherId], [platformKey]: null };
            }
          }
        }
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
  const shortcutsDialogOpen = useRecoilValue(store.showShortcutsDialog);

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
      if (e.repeat) {
        return;
      }

      const binding = bindingFromEvent(e);
      if (!binding) {
        return;
      }

      const matchedId = bindingMap.get(bindingHash(binding));
      if (!matchedId) {
        return;
      }

      if (shortcutsDialogOpen) {
        if (matchedId !== 'showShortcuts') {
          return;
        }
      } else if (anyModalOpen()) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isEditing =
        tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable === true;
      const isMainTextarea = target?.id === mainTextareaId;

      if (
        matchedId === 'submitMessage' &&
        ((isMainTextarea && e.key === 'Enter') || (isEditing && !isMainTextarea))
      ) {
        return;
      }

      const allowedWhileEditing: ShortcutActionId[] = [
        'focusChat',
        'focusSearch',
        'showShortcuts',
        'submitMessage',
      ];
      if (isEditing && !allowedWhileEditing.includes(matchedId)) {
        return;
      }

      e.preventDefault();
      actionMap.get(matchedId)?.run();
    },
    [actionMap, bindingMap, shortcutsDialogOpen],
  );

  useEffect(() => {
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handler]);
}

export { isMac };
