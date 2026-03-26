import { useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useArchiveConvoMutation, useDeleteConversationMutation } from '~/data-provider';
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

function getMainScrollContainer(): Element | null {
  return document.querySelector('main[role="main"]');
}

export default function useKeyboardShortcuts() {
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
    if (!sidebarExpanded) {
      setSidebarExpanded(true);
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(
          'input[aria-label][placeholder*="earch"]',
        );
        input?.focus();
      }, 350);
    } else {
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label][placeholder*="earch"]',
      );
      input?.focus();
    }
  }, [sidebarExpanded, setSidebarExpanded]);

  const handleShowShortcuts = useCallback(() => {
    setShowShortcutsDialog((prev) => !prev);
  }, [setShowShortcutsDialog]);

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

  const handler = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isEditing =
        tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable === true;

      const mod = isMac ? e.metaKey : e.ctrlKey;

      // Shift + Escape → Focus Chat Input (works anywhere)
      if (e.shiftKey && e.key === 'Escape') {
        e.preventDefault();
        handleFocusChatInput();
        return;
      }

      // All remaining shortcuts require mod key
      if (!mod) {
        return;
      }

      // Non-shift shortcuts
      if (!e.shiftKey) {
        // Cmd/Ctrl + / → Focus Search
        if (e.key === '/') {
          e.preventDefault();
          handleFocusSearch();
        }
        return;
      }

      // Cmd/Ctrl + Shift + / (?) → Show Keyboard Shortcuts (works even when editing)
      if (e.key === '?') {
        e.preventDefault();
        handleShowShortcuts();
        return;
      }

      // Remaining Cmd/Ctrl+Shift shortcuts should not fire when editing text
      if (isEditing) {
        return;
      }

      switch (e.key) {
        case 'O':
          e.preventDefault();
          handleNewChat();
          break;
        case 'S':
        case 's':
          e.preventDefault();
          handleToggleSidebar();
          break;
        case 'R':
          e.preventDefault();
          handleToggleRightSidebar();
          break;
        case 'M':
          e.preventDefault();
          handleOpenModelSelector();
          break;
        case ':':
        case ';':
          e.preventDefault();
          handleCopyLastResponse();
          break;
        case 'U':
          e.preventDefault();
          handleUploadFile();
          break;
        case 'X':
          e.preventDefault();
          handleStopGenerating();
          break;
        case 'E':
          e.preventDefault();
          handleRegenerateResponse();
          break;
        case 'I':
          e.preventDefault();
          handleEditLastMessage();
          break;
        case 'K':
          e.preventDefault();
          handleCopyLastCode();
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleScrollToTop();
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleScrollToBottom();
          break;
        case '<':
        case ',':
          e.preventDefault();
          handleOpenSettings();
          break;
        case 'T':
          e.preventDefault();
          handleToggleTemporaryChat();
          break;
        case 'A':
          e.preventDefault();
          handleArchiveConversation();
          break;
        case 'Backspace':
          e.preventDefault();
          handleDeleteConversation();
          break;
      }
    },
    [
      handleNewChat,
      handleFocusChatInput,
      handleToggleSidebar,
      handleToggleRightSidebar,
      handleOpenModelSelector,
      handleFocusSearch,
      handleShowShortcuts,
      handleCopyLastResponse,
      handleCopyLastCode,
      handleUploadFile,
      handleStopGenerating,
      handleRegenerateResponse,
      handleEditLastMessage,
      handleScrollToTop,
      handleScrollToBottom,
      handleOpenSettings,
      handleToggleTemporaryChat,
      handleArchiveConversation,
      handleDeleteConversation,
    ],
  );

  useEffect(() => {
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handler]);
}

export { isMac };
