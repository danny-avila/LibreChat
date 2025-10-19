import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ProseMirrorEditorRef } from "./ProseMirrorEditor";
import { useLocalize } from "~/hooks";
import { cn } from "~/utils";

interface Selection {
  from: number;
  to: number;
  text: string;
  coords?: { x: number; y: number };
}

interface AIToolsMenuProps {
  editor: ProseMirrorEditorRef | null;
  selection: Selection | null;
  onAIRequest: (
    prompt: string,
    selectedText: string,
    action: string,
  ) => Promise<void>;
  isAILoading: boolean;
  containerRef?: React.RefObject<HTMLElement>;
}

export default function AIToolsMenu({
  editor,
  selection,
  onAIRequest,
  isAILoading,
  containerRef,
}: AIToolsMenuProps) {
  const localize = useLocalize();
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [showAskDialog, setShowAskDialog] = useState(false);
  const [askInput, setAskInput] = useState("");
  const [askDialogPosition, setAskDialogPosition] = useState({ x: 0, y: 0 });
  const [showHeadingDropdown, setShowHeadingDropdown] = useState(false);
  const [headingDropdownPosition, setHeadingDropdownPosition] = useState({
    x: 0,
    y: 0,
  });

  const askDialogRef = useRef<HTMLDivElement>(null);
  const headingDropdownRef = useRef<HTMLDivElement>(null);

  // Calculate smart positioning for dialogs
  const calculatePosition = useCallback(
    (
      baseX: number,
      baseY: number,
      elementWidth: number,
      elementHeight: number,
    ) => {
      if (!containerRef?.current) {
        return { x: baseX, y: baseY };
      }

      const container = containerRef.current;
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
    [containerRef],
  );

  // Get selection position relative to editor container
  const getSelectionPosition = useCallback(() => {
    if (!containerRef?.current || !selection) {
      return { x: 100, y: 100 };
    }

    // Use actual coordinates from ProseMirror if available
    if (selection.coords) {
      return {
        x: selection.coords.x,
        y: selection.coords.y,
      };
    }

    // Fallback to default position
    return { x: 50, y: 100 };
  }, [containerRef, selection]);

  // Show/hide menu based on selection
  useEffect(() => {
    if (selection && selection.text && selection.text.trim().length > 0) {
      const selectionPos = getSelectionPosition();
      const menuWidth = 280;
      const menuHeight = 50;

      const position = calculatePosition(
        selectionPos.x,
        selectionPos.y,
        menuWidth,
        menuHeight,
      );
      setMenuPosition(position);
      setShowMenu(true);
    } else {
      setShowMenu(false);
      setShowAskDialog(false);
      setShowHeadingDropdown(false);
    }
  }, [selection, calculatePosition, getSelectionPosition]);

  // Handle click outside dialogs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showAskDialog &&
        askDialogRef.current &&
        !askDialogRef.current.contains(event.target as Node)
      ) {
        setShowAskDialog(false);
      }
      if (
        showHeadingDropdown &&
        headingDropdownRef.current &&
        !headingDropdownRef.current.contains(event.target as Node)
      ) {
        setShowHeadingDropdown(false);
      }
    };

    if (showAskDialog || showHeadingDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showAskDialog, showHeadingDropdown]);

  const handleFormatting = (format: string) => {
    if (!editor || !selection) return;

    const selectedText = selection.text;

    // Apply formatting directly using ProseMirror marks instead of markdown
    let markType = "";
    switch (format) {
      case "bold":
        markType = "strong";
        break;
      case "italic":
        markType = "em";
        break;
      case "code":
        markType = "code";
        break;
      default:
        return;
    }

    // Use the editor's native mark application
    editor.applyMark(markType, selectedText);
    setShowMenu(false);
  };

  const handleHeadingFormat = (level: number | false) => {
    if (!editor || !selection) return;

    const selectedText = selection.text;

    if (level === false) {
      // Convert to body text - remove all formatting and make it normal text
      editor.convertToBodyText();
    } else {
      // Add heading formatting
      const hashes = "#".repeat(level);
      const formattedText = `${hashes} ${selectedText}`;
      // Use markdown parsing for headings to ensure proper styling
      editor.replaceSelectionWithMarkdown(formattedText);
    }

    setShowMenu(false);
    setShowHeadingDropdown(false);
  };

  const handleAskLibrechat = () => {
    const selectionPos = getSelectionPosition();
    const dialogWidth = 320;
    const dialogHeight = 50;

    const position = calculatePosition(
      selectionPos.x,
      selectionPos.y + 50,
      dialogWidth,
      dialogHeight,
    );
    setAskDialogPosition(position);
    setShowAskDialog(true);
    setShowMenu(false);
  };

  const handleAskSubmit = async () => {
    if (!askInput.trim() || !selection) return;

    setShowAskDialog(false);
    setAskInput("");

    try {
      await onAIRequest(askInput, selection.text, "Ask LibreChat");
    } catch (_error) {
      // AI request failed
    }
  };

  const handleHeadingClick = () => {
    // Position dropdown relative to the main menu, not the selection
    const dropdownWidth = 160;
    const dropdownHeight = 200;

    // Position dropdown just below the main menu (50px is the menu height)
    const position = calculatePosition(
      menuPosition.x,
      menuPosition.y + 50,
      dropdownWidth,
      dropdownHeight,
    );
    setHeadingDropdownPosition(position);
    setShowHeadingDropdown(!showHeadingDropdown);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAskSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowAskDialog(false);
      setAskInput("");
    }
  };

  if (!showMenu && !showAskDialog && !showHeadingDropdown) {
    return null;
  }

  return (
    <>
      {/* Main Selection Menu */}
      {showMenu &&
        createPortal(
          <div
            className="absolute flex items-center justify-between gap-1 px-2 py-1 bg-gray-800 text-white rounded-3xl border border-gray-600 shadow-lg backdrop-blur-sm"
            style={{
              left: `${menuPosition.x}px`,
              top: `${menuPosition.y}px`,
              zIndex: 999999,
              width: "280px",
              backgroundColor: "rgba(45, 45, 45, 0.95)",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
              backdropFilter: "blur(8px)",
            }}
          >
            {/* Ask Librechat button */}
            <button
              onClick={handleAskLibrechat}
              disabled={isAILoading}
              className={cn(
                "flex items-center flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-2xl px-3 py-1 text-sm font-normal border-none cursor-pointer transition-colors",
                isAILoading && "opacity-50 cursor-not-allowed",
              )}
            >
              <span className="text-base font-normal mr-2">⊕</span>
              <span className="flex-1 text-center">
                {isAILoading ? "Processing..." : "Ask Librechat"}
              </span>
            </button>

            {/* Formatting buttons */}
            <div className="flex gap-1">
              <button
                onClick={() => handleFormatting("bold")}
                className="flex items-center justify-center w-8 h-8 bg-gray-700 hover:bg-gray-600 text-white rounded-lg border-none cursor-pointer text-sm font-bold transition-colors"
                title="Bold"
              >
                B
              </button>
              <button
                onClick={() => handleFormatting("italic")}
                className="flex items-center justify-center w-8 h-8 bg-gray-700 hover:bg-gray-600 text-white rounded-lg border-none cursor-pointer text-sm italic transition-colors"
                title="Italic"
              >
                I
              </button>
              <button
                onClick={handleHeadingClick}
                className="flex items-center justify-center w-8 h-8 bg-gray-700 hover:bg-gray-600 text-white rounded-lg border-none cursor-pointer text-xs font-medium transition-colors"
                title={localize("com_ui_text_size")}
              >
                {localize("com_ui_text_size_button")}
              </button>
            </div>
          </div>,
          containerRef?.current || document.body,
        )}

      {/* Ask Librechat Dialog */}
      {showAskDialog &&
        createPortal(
          <div
            ref={askDialogRef}
            className="absolute flex items-center gap-2 bg-gray-800 rounded-full px-4 py-2 shadow-lg border-none outline-none min-w-80 max-w-125"
            style={{
              left: `${askDialogPosition.x}px`,
              top: `${askDialogPosition.y}px`,
              zIndex: 1000000,
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
            }}
          >
            <input
              type="text"
              value={askInput}
              onChange={(e) => setAskInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Edit or explain..."
              className="flex-1 bg-transparent text-white placeholder-gray-400 text-sm border-none outline-none shadow-none appearance-none"
              // autoFocus removed for accessibility
              disabled={isAILoading}
            />

            <button
              onClick={handleAskSubmit}
              disabled={!askInput.trim() || isAILoading}
              className="w-8 h-8 bg-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
            >
              <span className="text-gray-800 text-lg">↑</span>
            </button>
          </div>,
          containerRef?.current || document.body,
        )}

      {/* Heading Dropdown */}
      {showHeadingDropdown &&
        createPortal(
          <div
            ref={headingDropdownRef}
            className="absolute bg-gray-800 rounded-lg shadow-lg border border-gray-600 py-2"
            style={{
              left: `${headingDropdownPosition.x}px`,
              top: `${headingDropdownPosition.y}px`,
              zIndex: 1000001,
              minWidth: "160px",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
            }}
          >
            <button
              onClick={() => handleHeadingFormat(1)}
              className="w-full text-left px-4 py-2 text-white hover:bg-gray-700 transition-colors text-2xl font-bold"
            >
              {localize("com_ui_heading_1")}
            </button>
            <button
              onClick={() => handleHeadingFormat(2)}
              className="w-full text-left px-4 py-2 text-white hover:bg-gray-700 transition-colors text-xl font-semibold"
            >
              {localize("com_ui_heading_2")}
            </button>
            <button
              onClick={() => handleHeadingFormat(3)}
              className="w-full text-left px-4 py-2 text-white hover:bg-gray-700 transition-colors text-lg font-medium"
            >
              {localize("com_ui_heading_3")}
            </button>
            <button
              onClick={() => handleHeadingFormat(false)}
              className="w-full text-left px-4 py-2 text-white hover:bg-gray-700 transition-colors text-base"
            >
              {localize("com_ui_body_text")}
            </button>
          </div>,
          containerRef?.current || document.body,
        )}
    </>
  );
}
