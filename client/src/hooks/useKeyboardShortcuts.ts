import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import { mainTextareaId } from '~/common';
import { clearMessagesCache } from '~/utils';
import useNewConvo from './useNewConvo';
import store from '~/store';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export type ShortcutDefinition = {
  /** Translation key for the shortcut label */
  labelKey: string;
  /** Translation key for the shortcut group/category */
  groupKey: string;
  /** Human-readable key combo for display (Mac) */
  displayMac: string;
  /** Human-readable key combo for display (non-Mac) */
  displayOther: string;
};

export const shortcutDefinitions: Record<string, ShortcutDefinition> = {
  newChat: {
    labelKey: 'com_ui_new_chat',
    groupKey: 'com_shortcut_group_general',
    displayMac: '⌘ ⇧ O',
    displayOther: 'Ctrl+Shift+O',
  },
  focusChat: {
    labelKey: 'com_shortcut_focus_chat_input',
    groupKey: 'com_shortcut_group_general',
    displayMac: '⇧ Esc',
    displayOther: 'Shift+Esc',
  },
  copyLastResponse: {
    labelKey: 'com_shortcut_copy_last_response',
    groupKey: 'com_shortcut_group_general',
    displayMac: '⌘ ⇧ ;',
    displayOther: 'Ctrl+Shift+;',
  },
  uploadFile: {
    labelKey: 'com_shortcut_upload_file',
    groupKey: 'com_shortcut_group_general',
    displayMac: '⌘ ⇧ U',
    displayOther: 'Ctrl+Shift+U',
  },
  toggleSidebar: {
    labelKey: 'com_shortcut_toggle_sidebar',
    groupKey: 'com_shortcut_group_navigation',
    displayMac: '⌘ ⇧ S',
    displayOther: 'Ctrl+Shift+S',
  },
  toggleRightSidebar: {
    labelKey: 'com_shortcut_toggle_right_sidebar',
    groupKey: 'com_shortcut_group_navigation',
    displayMac: '⌘ ⇧ R',
    displayOther: 'Ctrl+Shift+R',
  },
  openModelSelector: {
    labelKey: 'com_shortcut_open_model_selector',
    groupKey: 'com_shortcut_group_navigation',
    displayMac: '⌘ ⇧ M',
    displayOther: 'Ctrl+Shift+M',
  },
  focusSearch: {
    labelKey: 'com_shortcut_focus_search',
    groupKey: 'com_shortcut_group_navigation',
    displayMac: '⌘ /',
    displayOther: 'Ctrl+/',
  },
  openSettings: {
    labelKey: 'com_nav_settings',
    groupKey: 'com_shortcut_group_navigation',
    displayMac: '⌘ ⇧ ,',
    displayOther: 'Ctrl+Shift+,',
  },
  stopGenerating: {
    labelKey: 'com_nav_stop_generating',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ X',
    displayOther: 'Ctrl+Shift+X',
  },
  regenerateResponse: {
    labelKey: 'com_shortcut_regenerate_response',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ E',
    displayOther: 'Ctrl+Shift+E',
  },
  editLastMessage: {
    labelKey: 'com_shortcut_edit_last_message',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ I',
    displayOther: 'Ctrl+Shift+I',
  },
  copyLastCode: {
    labelKey: 'com_shortcut_copy_last_code',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ K',
    displayOther: 'Ctrl+Shift+K',
  },
  scrollToTop: {
    labelKey: 'com_shortcut_scroll_to_top',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ ↑',
    displayOther: 'Ctrl+Shift+↑',
  },
  scrollToBottom: {
    labelKey: 'com_shortcut_scroll_to_bottom',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ ↓',
    displayOther: 'Ctrl+Shift+↓',
  },
  toggleTemporaryChat: {
    labelKey: 'com_ui_temporary',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ T',
    displayOther: 'Ctrl+Shift+T',
  },
  archiveConversation: {
    labelKey: 'com_shortcut_archive_conversation',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ A',
    displayOther: 'Ctrl+Shift+A',
  },
  deleteConversation: {
    labelKey: 'com_shortcut_delete_conversation',
    groupKey: 'com_shortcut_group_chat',
    displayMac: '⌘ ⇧ ⌫',
    displayOther: 'Ctrl+Shift+Backspace',
  },
};

export default function useKeyboardShortcuts() {
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const [sidebarExpanded, setSidebarExpanded] = useRecoilState(store.sidebarExpanded);
  const setShowShortcutsDialog = useSetRecoilState(store.showShortcutsDialog);
  const [isTemporary, setIsTemporary] = useRecoilState(store.isTemporary);

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
    const modelButton = document.querySelector<HTMLButtonElement>(
      '[data-testid="model-selector-button"]',
    );
    if (modelButton) {
      modelButton.click();
    }
  }, []);

  const handleFocusSearch = useCallback(() => {
    if (!sidebarExpanded) {
      setSidebarExpanded(true);
      setTimeout(() => {
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[aria-label][placeholder*="earch"]',
        );
        searchInput?.focus();
      }, 350);
    } else {
      const searchInput = document.querySelector<HTMLInputElement>(
        'input[aria-label][placeholder*="earch"]',
      );
      searchInput?.focus();
    }
  }, [sidebarExpanded, setSidebarExpanded]);

  const handleShowShortcuts = useCallback(() => {
    setShowShortcutsDialog((prev) => !prev);
  }, [setShowShortcutsDialog]);

  const handleCopyLastResponse = useCallback(() => {
    const agentTurns = document.querySelectorAll('.agent-turn');
    if (agentTurns.length === 0) {
      return;
    }
    const last = agentTurns[agentTurns.length - 1];
    const markdown = last.querySelector('.markdown');
    const text = (markdown ?? last).textContent ?? '';
    if (text.trim()) {
      navigator.clipboard.writeText(text.trim());
    }
  }, []);

  const handleStopGenerating = useCallback(() => {
    const stopButton = document.querySelector<HTMLButtonElement>('button[aria-label*="top"]');
    if (stopButton) {
      stopButton.click();
    }
  }, []);

  const handleScrollToBottom = useCallback(() => {
    const container = document.querySelector('[class*="overflow-y-auto"][class*="flex-col"]');
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      return;
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }, []);

  const handleOpenSettings = useCallback(() => {
    const settingsButton = document.querySelector<HTMLElement>('[data-testid="nav-user"]');
    if (settingsButton) {
      settingsButton.click();
      setTimeout(() => {
        const settingsItem = document.querySelector<HTMLElement>(
          '[role="menuitem"][class*="select-item"]',
        );
        const items = document.querySelectorAll<HTMLElement>('[role="menuitem"]');
        for (const item of items) {
          if (item.textContent?.includes('Settings') && !item.textContent?.includes('Keyboard')) {
            item.click();
            return;
          }
        }
      }, 150);
    }
  }, []);

  const handleToggleTemporaryChat = useCallback(() => {
    setIsTemporary((prev) => !prev);
  }, [setIsTemporary]);

  const handleCopyLastCode = useCallback(() => {
    const codeBlocks = document.querySelectorAll('.agent-turn pre code');
    if (codeBlocks.length === 0) {
      return;
    }
    const last = codeBlocks[codeBlocks.length - 1];
    const text = last.textContent ?? '';
    if (text.trim()) {
      navigator.clipboard.writeText(text.trim());
    }
  }, []);

  const handler = useCallback(
    (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + Shift + O → New Chat
      if (mod && e.shiftKey && e.key === 'O') {
        e.preventDefault();
        handleNewChat();
        return;
      }

      // Shift + Escape → Focus Chat Input
      if (e.shiftKey && e.key === 'Escape') {
        e.preventDefault();
        handleFocusChatInput();
        return;
      }

      // Cmd/Ctrl + Shift + S → Toggle Sidebar
      if (mod && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        handleToggleSidebar();
        return;
      }

      // Cmd/Ctrl + Shift + M → Open Model Selector
      if (mod && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        handleOpenModelSelector();
        return;
      }

      // Cmd/Ctrl + / → Focus Search
      if (mod && !e.shiftKey && e.key === '/') {
        e.preventDefault();
        handleFocusSearch();
        return;
      }

      // Cmd/Ctrl + Shift + ; → Copy Last Response
      if (mod && e.shiftKey && (e.key === ':' || e.key === ';')) {
        e.preventDefault();
        handleCopyLastResponse();
        return;
      }

      // Cmd/Ctrl + Shift + X → Stop Generating
      if (mod && e.shiftKey && e.key === 'X') {
        e.preventDefault();
        handleStopGenerating();
        return;
      }

      // Cmd/Ctrl + Shift + ↓ → Scroll to Bottom
      if (mod && e.shiftKey && e.key === 'ArrowDown') {
        e.preventDefault();
        handleScrollToBottom();
        return;
      }

      // Cmd/Ctrl + Shift + , → Open Settings
      if (mod && e.shiftKey && (e.key === '<' || e.key === ',')) {
        e.preventDefault();
        handleOpenSettings();
        return;
      }

      // Cmd/Ctrl + Shift + T → Toggle Temporary Chat
      if (mod && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        handleToggleTemporaryChat();
        return;
      }

      // Cmd/Ctrl + Shift + K → Copy Last Code Block
      if (mod && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        handleCopyLastCode();
        return;
      }

      // Cmd/Ctrl + Shift + / (Cmd/Ctrl + ?) → Show Keyboard Shortcuts
      if (mod && e.shiftKey && e.key === '?') {
        e.preventDefault();
        handleShowShortcuts();
        return;
      }
    },
    [
      handleNewChat,
      handleFocusChatInput,
      handleToggleSidebar,
      handleOpenModelSelector,
      handleFocusSearch,
      handleShowShortcuts,
      handleCopyLastResponse,
      handleStopGenerating,
      handleScrollToBottom,
      handleOpenSettings,
      handleToggleTemporaryChat,
      handleCopyLastCode,
    ],
  );

  useEffect(() => {
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handler]);
}

export { isMac };
