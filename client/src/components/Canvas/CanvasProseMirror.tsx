import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRecoilState, useSetRecoilState, useResetRecoilState } from "recoil";
import { X, FileText, Download, Save } from "lucide-react";
import { useUpdateMessageMutation } from "librechat-data-provider/react-query";
import "./Canvas.css";
import { useAuthContext, useLocalize } from "~/hooks";
import { useDirectAI, useCanvas } from "~/hooks/Canvas";
import { useChatContext } from "~/Providers";
import { NotificationSeverity } from "~/common";
import {
  ProseMirrorEditor,
  AIToolsMenu,
  StreamingHandler,
} from "./ProseMirror";
import type { ProseMirrorEditorRef } from "./ProseMirror";
import AIResponseBlock from "./AIResponseBlock";
import { cn } from "~/utils";
import store from "~/store";

interface Selection {
  from: number;
  to: number;
  text: string;
  coords?: { x: number; y: number };
}

export default function CanvasProseMirror() {
  const { user: _user } = useAuthContext();
  const localize = useLocalize();
  const {
    isSubmitting,
    latestMessage: _latestMessage,
    conversation,
    getMessages,
    setMessages,
  } = useChatContext();
  const [canvasData] = useRecoilState(store.canvasState);
  const setCanvasVisible = useSetRecoilState(store.canvasVisibility);
  const setToast = useSetRecoilState(store.toastState);

  const showToast = useCallback(
    ({
      message,
      severity = NotificationSeverity.SUCCESS,
      showIcon = true,
      duration = 3000,
    }) => {
      setToast({
        open: true,
        message,
        severity,
        showIcon,
      });
      // Auto-hide after specified duration
      setTimeout(() => {
        setToast((prev) => ({ ...prev, open: false }));
      }, duration);
    },
    [setToast],
  );

  // Canvas state management (similar to useArtifacts)
  useCanvas();

  // Clear artifacts when Canvas renders
  const resetArtifactsState = useResetRecoilState(store.artifactsState);

  // State declarations
  const [content, setContent] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // AI Response Block state
  const [showResponseBlock, setShowResponseBlock] = useState(false);
  const [currentAction, setCurrentAction] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isAILoading, setIsAILoading] = useState(false);
  const [operationType, setOperationType] = useState<
    "edit" | "explain" | "default"
  >("default");

  // Document title state
  const [documentTitle, setDocumentTitle] = useState("Untitled Document");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");

  // Refs
  const originalContent = useRef("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<ProseMirrorEditorRef>(null);
  const streamingHandlerRef = useRef<StreamingHandler | null>(null);

  // Initialize update message mutation
  const updateMessageMutation = useUpdateMessageMutation(
    conversation?.conversationId ?? "",
  );

  // Clear artifacts data when Canvas component mounts
  useEffect(() => {
    resetArtifactsState();
  }, [resetArtifactsState]);
  // Initialize streaming handler
  useEffect(() => {
    if (editorRef.current && !streamingHandlerRef.current) {
      streamingHandlerRef.current = new StreamingHandler({
        editor: editorRef.current,
        onStreamStart: () => {
          setIsAILoading(true);
        },
        onStreamEnd: () => {
          setIsAILoading(false);
        },
        onError: (_error) => {
          setIsAILoading(false);
        },
      });
    }
  }, []);

  // Update streaming handler when editor changes
  useEffect(() => {
    if (streamingHandlerRef.current && editorRef.current) {
      streamingHandlerRef.current.updateEditor(editorRef.current);
    }
  }, []);

  const {
    sendDirectRequest,
    isLoading: _directAILoading,
    canSendRequest,
  } = useDirectAI({
    onSuccess: (response, opType) => {
      setAiResponse(response || "Response received successfully.");
      setOperationType(opType || "default");
      setIsAILoading(false);

      // Stop streaming to prevent conflicts
      if (streamingHandlerRef.current) {
        streamingHandlerRef.current.stopStreaming();
      }

      // DON'T automatically insert - let user choose Insert/Replace
      // The response will only be shown in AIResponseBlock
    },
    onError: (_error) => {
      setAiResponse("Error generating response. Please try again.");
      setIsAILoading(false);

      if (streamingHandlerRef.current) {
        streamingHandlerRef.current.stopStreaming();
      }
    },
  });

  // Initialize content and title when canvas data changes
  useEffect(() => {
    if (canvasData?.content) {
      setContent(canvasData.content);
      originalContent.current = canvasData.content;
      setHasLocalChanges(false);
    }

    // Update document title from canvas data
    if (canvasData?.title) {
      setDocumentTitle(canvasData.title);
    }
  }, [canvasData]);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Handle content changes
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setHasLocalChanges(newContent !== originalContent.current);
  }, []);

  // Handle selection changes
  const handleSelectionChange = useCallback((newSelection: Selection) => {
    setSelection(newSelection);
  }, []);

  // Calculate position using same logic as text selection dialog
  const calculatePosition = useCallback(
    (
      baseX: number,
      baseY: number,
      elementWidth: number,
      elementHeight: number,
    ) => {
      const container = editorRef.current?.getContainerRef().current;
      if (!container) {
        return { x: baseX, y: baseY };
      }

      // Use scrollable dimensions instead of viewport dimensions
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const scrollTop = container.scrollTop;
      const scrollLeft = container.scrollLeft;

      let x = baseX;
      let y = baseY;

      // Check right boundary overflow
      if (x + elementWidth > containerWidth - scrollLeft) {
        x = Math.max(10, containerWidth - elementWidth - 10);
      }

      // Check left boundary overflow
      if (x < scrollLeft + 10) {
        x = scrollLeft + 10;
      }

      // Check bottom boundary overflow - this is the key fix
      const visibleBottom = scrollTop + containerHeight;
      if (y + elementHeight > visibleBottom - 10) {
        // Position above selection instead, with enough space
        y = Math.max(scrollTop + 10, baseY - elementHeight - 20);
      }

      // Check top boundary overflow
      if (y < scrollTop + 10) {
        y = scrollTop + 10;
      }

      return { x, y };
    },
    [],
  );

  // Get AI Response position using same logic as text selection dialog
  const getAIResponsePosition = useCallback(() => {
    if (!selection?.coords) {
      return { x: 100, y: 100 };
    }

    const responseBlockWidth = 400; // Updated to match new dialog width
    const responseBlockHeight = 280; // Updated to match new dialog height
    const dropdownHeight = 80; // Extra space for Insert/Replace dropdown

    // Position 50px below selection, same as Ask Librechat dialog offset
    const baseY = selection.coords.y + 50;

    // Calculate position with extra height to account for dropdown overflow
    return calculatePosition(
      selection.coords.x,
      baseY,
      responseBlockWidth,
      responseBlockHeight + dropdownHeight,
    );
  }, [selection, calculatePosition]);

  // Handle title editing
  const handleEditTitle = useCallback(() => {
    setTempTitle(documentTitle);
    setIsEditingTitle(true);
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
  }, [documentTitle]);

  const handleSaveTitle = useCallback(() => {
    if (tempTitle.trim()) {
      setDocumentTitle(tempTitle.trim());
    }
    setIsEditingTitle(false);
    setTempTitle("");
  }, [tempTitle]);

  const handleCancelTitleEdit = useCallback(() => {
    setIsEditingTitle(false);
    setTempTitle("");
  }, []);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSaveTitle();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancelTitleEdit();
      }
    },
    [handleSaveTitle, handleCancelTitleEdit],
  );

  // AI assistance functions
  const handleAIRequest = useCallback(
    async (prompt: string, textToProcess: string, actionLabel?: string) => {
      setCurrentAction(actionLabel || "AI Response");
      setAiResponse("");
      setIsAILoading(true);
      setShowResponseBlock(true);

      try {
        if (!canSendRequest) {
          setAiResponse(
            "Chat not available. Please start a conversation first.",
          );
          setIsAILoading(false);
          return;
        }

        // Don't start streaming to editor - response will only show in AIResponseBlock

        // Get full canvas content for context
        const fullCanvasContent = editorRef.current?.getContent() || "";

        // Get selected text with markdown formatting preserved
        const selectedMarkdown =
          editorRef.current?.getSelectedMarkdown() || textToProcess;

        await sendDirectRequest(prompt, selectedMarkdown, fullCanvasContent);
      } catch (_error) {
        setAiResponse("Error generating response. Please try again.");
        setIsAILoading(false);

        if (streamingHandlerRef.current) {
          streamingHandlerRef.current.stopStreaming();
        }
      }
    },
    [sendDirectRequest, canSendRequest],
  );
  // Save canvas changes - converts ProseMirror to markdown, updates state, and calls backend API
  const saveCanvasChanges = useCallback(() => {
    if (
      !canvasData?.messageId ||
      !conversation?.conversationId ||
      !hasLocalChanges
    ) {
      return;
    }

    // Step 1: Get current ProseMirror content and convert to markdown
    const currentMarkdownContent = content; // Already in markdown format from ProseMirror

    // Step 2: Construct updated canvas directive with new content
    const updatedCanvasText = `::::canvas{title="${documentTitle}"}
${currentMarkdownContent}
:::`;

    // Step 3: Update React Query cache immediately (optimistic update)
    const messages = getMessages();
    if (messages) {
      const updatedMessages = messages.map((msg) =>
        msg.messageId === canvasData.messageId
          ? {
              ...msg,
              text: updatedCanvasText, // Update with new canvas content
            }
          : msg,
      );

      // Update local state immediately - UI updates instantly!
      setMessages(updatedMessages);
    }

    // Step 4: Send backend API call to store the edited message

    updateMessageMutation.mutate(
      {
        conversationId: conversation.conversationId,
        model: conversation.model ?? "gpt-3.5-turbo",
        text: updatedCanvasText,
        messageId: canvasData.messageId,
      },
      {
        onSuccess: (_response) => {
          // Show success toast
          showToast({
            message: "Canvas saved successfully!",
            severity: NotificationSeverity.SUCCESS,
            duration: 2000,
          });

          // Reset local changes flag
          setHasLocalChanges(false);
          originalContent.current = currentMarkdownContent;
        },
        onError: (_error) => {
          // Show error toast
          showToast({
            message: "Failed to save canvas. Please try again.",
            severity: NotificationSeverity.ERROR,
            duration: 3000,
          });
        },
      },
    );
  }, [
    canvasData,
    conversation,
    hasLocalChanges,
    content,
    documentTitle,
    getMessages,
    setMessages,
    updateMessageMutation,
    showToast,
  ]);

  // Keyboard shortcut for saving (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (hasLocalChanges && !updateMessageMutation.isLoading) {
          saveCanvasChanges();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [saveCanvasChanges, hasLocalChanges, updateMessageMutation.isLoading]);

  // Download canvas content as markdown file
  const downloadAsMarkdown = useCallback(() => {
    if (!content || !documentTitle) {
      return;
    }

    const markdownContent = `# ${documentTitle}\n\n${content}`;
    const blob = new Blob([markdownContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    const sanitizedTitle = documentTitle
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    link.download = `${sanitizedTitle}.md`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [content, documentTitle]);

  // Close canvas
  const closeCanvas = () => {
    setIsVisible(false);
    setTimeout(() => setCanvasVisible(false), 300);
  };

  if (!canvasData) {
    return null;
  }

  return (
    <div
      className={`canvas-prosemirror-container flex h-full w-full flex-col overflow-hidden border border-border-medium bg-surface-primary text-text-primary transition-all duration-500 ease-in-out ${
        isVisible
          ? "scale-100 opacity-100 blur-0"
          : "scale-105 opacity-0 blur-sm"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-light bg-white dark:bg-gray-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              onBlur={handleSaveTitle}
              className="text-lg font-medium text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={50}
            />
          ) : (
            <h3
              onClick={handleEditTitle}
              className="text-lg font-medium text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title="Click to rename document"
            >
              {documentTitle}
            </h3>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={saveCanvasChanges}
            disabled={!hasLocalChanges || updateMessageMutation.isLoading}
            className={`p-1.5 rounded-md transition-colors ${
              hasLocalChanges && !updateMessageMutation.isLoading
                ? "hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
            }`}
            title={
              updateMessageMutation.isLoading
                ? localize("com_ui_saving_changes")
                : hasLocalChanges
                  ? localize("com_ui_save_changes_to_database")
                  : localize("com_ui_no_changes_to_save")
            }
          >
            <Save
              className={`h-5 w-5 ${updateMessageMutation.isLoading ? "animate-spin" : ""}`}
            />
          </button>
          <button
            onClick={downloadAsMarkdown}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Download as Markdown (.md)"
          >
            <Download className="h-5 w-5" />
          </button>
          <button
            onClick={closeCanvas}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Close Canvas"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className={cn(
          "flex-1 relative overflow-hidden",
          isSubmitting ? "submitting" : "",
          isSubmitting && !!content.length ? "result-streaming" : "",
        )}
      >
        <ProseMirrorEditor
          ref={editorRef}
          content={content}
          onChange={handleContentChange}
          onSelectionChange={handleSelectionChange}
          className="h-full w-full"
          placeholder="Start writing your document..."
        />

        {/* Code block copy buttons overlay */}

        {/* Help overlay when no content */}
        {!content && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-gray-400 dark:text-gray-500">
              <div className="text-lg font-medium mb-2">
                {localize("com_ui_canvas_document")}
              </div>
              <div className="text-sm">
                {localize("com_ui_click_to_start_writing")}
              </div>
              <div className="text-xs mt-1">
                {localize("com_ui_select_text_for_ai_assistance")}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Tools Menu */}
      <AIToolsMenu
        editor={editorRef.current}
        selection={selection}
        onAIRequest={handleAIRequest}
        isAILoading={isAILoading}
        containerRef={editorRef.current?.getContainerRef()}
      />

      {/* AI Response Block - Render as portal within editor container */}
      {showResponseBlock &&
        editorRef.current &&
        createPortal(
          <AIResponseBlock
            action={currentAction}
            originalText={selection?.text || ""}
            response={aiResponse}
            isLoading={isAILoading}
            position={getAIResponsePosition()} // Smart positioning near selection
            operationType={operationType}
            onClose={() => {
              setShowResponseBlock(false);
              setSelection(null);
              setAiResponse("");
              setCurrentAction("");
            }}
            onInsert={() => {
              if (aiResponse && editorRef.current) {
                // Insert AI response at current cursor position
                editorRef.current.insertAIResponse(aiResponse);
              }
              setShowResponseBlock(false);
              setSelection(null);
              setAiResponse("");
            }}
            onReplace={() => {
              if (aiResponse && editorRef.current && selection) {
                // Replace selected text with AI response
                editorRef.current.replaceSelectionWithAI(aiResponse);
              }
              setShowResponseBlock(false);
              setSelection(null);
              setAiResponse("");
            }}
          />,
          editorRef.current.getContainerRef().current || document.body,
        )}
    </div>
  );
}
