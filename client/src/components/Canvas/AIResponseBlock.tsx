import { X, RefreshCw, Check, Edit3, Copy, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Markdown from "~/components/Chat/Messages/Content/Markdown";
import Container from "~/components/Chat/Messages/Content/Container";
import { useLocalize } from "~/hooks";
import { cn } from "~/utils";

interface AIResponseBlockProps {
  action: string;
  originalText: string;
  response: string;
  isLoading: boolean;
  position: { x: number; y: number };
  operationType?: "edit" | "explain" | "default";
  onClose: () => void;
  onInsert: () => void;
  onReplace: () => void;
}

export default function AIResponseBlock({
  action,
  response,
  isLoading,
  position,
  operationType = "default",
  onClose,
  onInsert,
  onReplace,
}: AIResponseBlockProps) {
  const localize = useLocalize();
  const [showDropdown, setShowDropdown] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle copy to clipboard
  const handleCopy = async () => {
    if (!response) return;

    try {
      await navigator.clipboard.writeText(response);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (_err) {
      // Failed to copy text
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDropdown]);

  return (
    <div
      className="bg-surface-primary dark:bg-gray-800 border border-border-medium rounded-2xl shadow-lg mt-3"
      style={{
        position: "absolute",
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 1000000,
        pointerEvents: "auto",
        border: "none",
        outline: "none",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
        width: "400px",
        height: "280px",
        maxWidth: "calc(100vw - 40px)",
        maxHeight: "calc(100vh - 40px)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-3 border-b border-border-light dark:border-gray-600">
        <div className="flex items-center gap-2">
          <Edit3 className="h-5 w-5 text-text-secondary dark:text-gray-300" />
          <span className="text-base font-medium text-text-primary dark:text-white">
            {action}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-text-secondary dark:text-gray-400 hover:text-text-primary dark:hover:text-gray-200 p-1 rounded-full hover:bg-surface-hover dark:hover:bg-gray-700 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-col" style={{ height: "calc(100% - 60px)" }}>
        {/* AI Response - Scrollable Content Area */}
        <div className="flex-1 px-3 pt-3 pb-2 overflow-hidden">
          <div className="bg-surface-secondary dark:bg-gray-700 rounded-lg p-4 h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
            {isLoading ? (
              <div className="flex items-center gap-2 text-text-secondary dark:text-gray-300">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>{localize("com_ui_canvas_generating")}</span>
              </div>
            ) : (
              <Container>
                <div
                  className={cn(
                    "markdown prose message-content dark:prose-invert light w-full break-words",
                    "text-text-primary dark:text-gray-100",
                  )}
                >
                  {response ? (
                    <Markdown content={response} isLatestMessage={true} />
                  ) : (
                    <div className="text-text-secondary dark:text-gray-400">
                      {localize("com_ui_no_response_yet")}
                    </div>
                  )}
                </div>
              </Container>
            )}
          </div>
        </div>

        {/* Action Buttons - Fixed at bottom */}
        <div className="flex items-center gap-2 px-3 pb-3 pt-2 border-t border-border-light dark:border-gray-600">
          {/* Copy Button */}
          <button
            onClick={handleCopy}
            disabled={isLoading || !response}
            className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary dark:text-gray-300 border border-border-medium dark:border-gray-600 rounded-full hover:bg-surface-hover dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            <Copy className="h-4 w-4" />
            <span>
              {copySuccess
                ? localize("com_ui_copied")
                : localize("com_ui_copy")}
            </span>
          </button>

          {/* Insert Dropdown - Hide for explain operations */}
          {operationType !== "explain" && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                disabled={isLoading || !response}
                className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-surface-submit hover:bg-surface-submit-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-full"
              >
                <Check className="h-4 w-4" />
                <span>{localize("com_ui_insert")}</span>
                <ChevronDown className="h-4 w-4" />
              </button>

              {/* Dropdown Menu */}
              {showDropdown && (
                <div className="absolute right-0 top-full mt-2 bg-surface-primary dark:bg-gray-800 border border-border-medium dark:border-gray-600 rounded-lg shadow-lg min-w-[140px] z-50">
                  <button
                    onClick={() => {
                      onInsert();
                      setShowDropdown(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary dark:text-white hover:bg-surface-hover dark:hover:bg-gray-700 transition-colors first:rounded-t-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      <span>{localize("com_ui_insert")}</span>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      onReplace();
                      setShowDropdown(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary dark:text-white hover:bg-surface-hover dark:hover:bg-gray-700 transition-colors last:rounded-b-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Edit3 className="h-4 w-4" />
                      <span>{localize("com_ui_replace")}</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
