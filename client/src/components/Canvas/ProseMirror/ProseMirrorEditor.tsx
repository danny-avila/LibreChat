import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { EditorState, Transaction, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, chainCommands, exitCode, splitBlock } from 'prosemirror-commands';
import { markdownSchema, parseMarkdownText, parseInlineMarkdown, proseMirrorToMarkdown, createEmptyDoc } from './schema';
import { cn } from '~/utils';
import './ProseMirror.css';


// Shared regex pattern for detecting block-level markdown
const BLOCK_MARKDOWN_PATTERN = /^\*\s|^\d+\.\s|^-\s|```[\s\S]*```|^\>\s/m;

// Custom Enter key handler that creates line breaks or new list items
function createSmartEnterHandler() {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    
    if (!dispatch) return false;

    const { $from, $to, empty } = state.selection;
    
    // Check if we're in a list item or code block by looking at parent nodes
    let isInListItem = false;
    let isInCodeBlock = false;
    let listItemDepth = -1;
    let codeBlockDepth = -1;
    
    for (let depth = $from.depth; depth >= 0; depth--) {
      const node = $from.node(depth);
      
      if (node.type.name === 'list_item') {
        isInListItem = true;
        listItemDepth = depth;
        break;
      } else if (node.type.name === 'code_block') {
        isInCodeBlock = true;
        codeBlockDepth = depth;
        break;
      }
    }
    
    if (isInListItem && empty && $from.parent.content.size === 0) {
      // Empty list item - remove it and exit the list
      const listItemStart = $from.start(listItemDepth);
      const listItemEnd = $from.end(listItemDepth);
      
      // Create a new paragraph to replace the empty list item
      const paragraph = markdownSchema.node('paragraph');
      const tr = state.tr.replaceWith(listItemStart - 1, listItemEnd, paragraph);
      
      dispatch(tr);
      return true;
    } else if (isInListItem) {
      // We're in a list item with content - create a new list item
      
      // Manually create new list item (skip splitBlock entirely)
      const listItemEnd = $from.end(listItemDepth);
      
      // Create a new list item with an empty paragraph inside
      const paragraph = markdownSchema.node('paragraph');
      const newListItem = markdownSchema.node('list_item', null, paragraph);
      
      
      const tr = state.tr.insert(listItemEnd, newListItem);
      
      // Position cursor inside the new list item's paragraph
      const newCursorPos = listItemEnd + 2; // +1 for list_item node, +1 to get inside paragraph
      
      try {
        const $pos = tr.doc.resolve(newCursorPos);
        tr.setSelection(state.selection.constructor.near($pos));
      } catch (error) {
        console.error('Failed to set cursor position:', error);
        // Fallback: just put cursor at the end
        tr.setSelection(state.selection.constructor.near(tr.doc.resolve(listItemEnd + 1)));
      }
      
      dispatch(tr);
      return true;
    } else if (isInCodeBlock) {
      // We're in a code block - insert a newline character (text node with \n)
      const newlineText = markdownSchema.text('\n');
      const tr = state.tr.replaceSelectionWith(newlineText);
      
      dispatch(tr);
      return true;
    } else {
      // Not in a list or code block, insert a line break
      const hardBreak = markdownSchema.node('hard_break');
      const tr = state.tr.replaceSelectionWith(hardBreak);
      
      dispatch(tr);
      return true;
    }
  };
}


// Plugin for handling AI tool integration
function createAIToolsPlugin(onSelectionChange: (selection: { from: number; to: number; text: string; coords?: { x: number; y: number } }) => void) {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mouseup: (view) => {
          const { from, to } = view.state.selection;
          
          if (from !== to) {
            const selectedText = view.state.doc.textBetween(from, to);
            
            // Get selection coordinates
            const coords = view.coordsAtPos(from);
            const editorRect = view.dom.getBoundingClientRect();
            const containerRect = view.dom.parentElement?.getBoundingClientRect();
            
            // Calculate position relative to editor container, accounting for scroll
            const relativeCoords = {
              x: coords.left - (containerRect?.left || editorRect.left),
              y: coords.bottom - (containerRect?.top || editorRect.top) + 5 // 5px below selection
            };
            
            onSelectionChange({ from, to, text: selectedText, coords: relativeCoords });
          } else {
            onSelectionChange({ from: 0, to: 0, text: '' });
          }
          return false;
        },
        keyup: (view) => {
          const { from, to } = view.state.selection;
          if (from !== to) {
            const selectedText = view.state.doc.textBetween(from, to);
            
            // Get selection coordinates
            const coords = view.coordsAtPos(from);
            const editorRect = view.dom.getBoundingClientRect();
            const containerRect = view.dom.parentElement?.getBoundingClientRect();
            
            // Calculate position relative to editor container, accounting for scroll
            const relativeCoords = {
              x: coords.left - (containerRect?.left || editorRect.left),
              y: coords.bottom - (containerRect?.top || editorRect.top) + 5 // 5px below selection
            };
            
            onSelectionChange({ from, to, text: selectedText, coords: relativeCoords });
          } else {
            onSelectionChange({ from: 0, to: 0, text: '' });
          }
          return false;
        },
      },
    },
  });
}

// Plugin for handling streaming content insertion
function createStreamingPlugin() {
  return new Plugin({
    state: {
      init() {
        return { isStreaming: false, streamPosition: 0 };
      },
      apply(tr, value) {
        const streaming = tr.getMeta('streaming');
        if (streaming !== undefined) {
          return { ...value, isStreaming: streaming.active, streamPosition: streaming.position || value.streamPosition };
        }
        return value;
      },
    },
  });
}

export interface ProseMirrorEditorRef {
  insertText: (text: string, position?: number) => void;
  replaceSelection: (text: string) => void;
  replaceSelectionWithMarkdown: (text: string) => void;
  insertAIResponse: (text: string) => void;
  replaceSelectionWithAI: (text: string) => void;
  convertToBodyText: () => void;
  applyMark: (markType: string, text: string) => void;
  getContent: () => string;
  getSelectedMarkdown: () => string;
  setContent: (content: string) => void;
  focus: () => void;
  startStreaming: (position?: number) => void;
  stopStreaming: () => void;
  appendStreamingText: (text: string) => void;
  getContainerRef: () => React.RefObject<HTMLDivElement>;
}

interface ProseMirrorEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  onSelectionChange?: (selection: { from: number; to: number; text: string; coords?: { x: number; y: number } }) => void;
  className?: string;
  placeholder?: string;
  editable?: boolean;
}

const ProseMirrorEditor = forwardRef<ProseMirrorEditorRef, ProseMirrorEditorProps>(
  ({ content = '', onChange, onSelectionChange, className, placeholder, editable = true }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const streamingBufferRef = useRef<string>('');
    const streamingPositionRef = useRef<number>(0);
    

    // Handle selection changes
    const handleSelectionChange = useCallback((selection: { from: number; to: number; text: string; coords?: { x: number; y: number } }) => {
      onSelectionChange?.(selection);
    }, [onSelectionChange]);

    // Initialize editor
    useEffect(() => {
      if (!editorRef.current) return;

      const doc = content ? parseMarkdownText(content) : createEmptyDoc();

      const plugins = [
        history(),
        // Our custom keymap should come BEFORE baseKeymap to have priority
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo,
          'Enter': createSmartEnterHandler(), // Smart Enter key handler for lists and line breaks
        }),
        // Create a modified baseKeymap without the Enter key
        keymap({
          ...Object.fromEntries(
            Object.entries(baseKeymap).filter(([key]) => key !== 'Enter')
          )
        }),
        createAIToolsPlugin(handleSelectionChange),
        createStreamingPlugin(),
      ];

      const state = EditorState.create({
        doc,
        plugins,
      });

      const view = new EditorView(editorRef.current, {
        state,
        editable: () => editable,
        dispatchTransaction: (transaction: Transaction) => {
          const newState = view.state.apply(transaction);
          view.updateState(newState);


          // Notify parent of content changes
          if (transaction.docChanged && onChange) {
            const newContent = proseMirrorToMarkdown(newState.doc);
            onChange(newContent);
          }
        },
      });

      viewRef.current = view;


      // Add click handler for code block copying
      const handleCodeBlockClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        
        // Check if clicked on copy button
        if (target.classList.contains('canvas-copy-btn') || target.closest('.canvas-copy-btn')) {
          const copyBtn = target.classList.contains('canvas-copy-btn') ? target : target.closest('.canvas-copy-btn') as HTMLElement;
          const codeBlock = copyBtn.closest('.canvas-code-block') || copyBtn.closest('.canvas-simple-code');
          
          if (codeBlock) {
            const codeElement = codeBlock.querySelector('code');
            if (codeElement) {
              const codeText = codeElement.textContent || '';
              navigator.clipboard.writeText(codeText.trim()).then(() => {
                // Show temporary feedback
                copyBtn.textContent = '✅ Copied!';
                copyBtn.classList.add('copied');
                
                setTimeout(() => {
                  copyBtn.textContent = '📋 Copy';
                  copyBtn.classList.remove('copied');
                }, 2000);
              }).catch(() => {});
            }
          }
        }
      };

      if (editorRef.current) {
        editorRef.current.addEventListener('click', handleCodeBlockClick);
      }

      return () => {
        view.destroy();
        viewRef.current = null;
        if (editorRef.current) {
          editorRef.current.removeEventListener('click', handleCodeBlockClick);
        }
      };
    }, [editable, handleSelectionChange, onChange]);

    // Update content when prop changes (using incremental updates to prevent flickering)
    useEffect(() => {
      if (!viewRef.current) return;

      const currentContent = proseMirrorToMarkdown(viewRef.current.state.doc);
      if (currentContent !== content) {
        const view = viewRef.current;
        const newDoc = content ? parseMarkdownText(content) : createEmptyDoc();
        
        // Use transaction-based update instead of recreating entire state
        // This preserves DOM elements and prevents flickering
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
        view.dispatch(tr);
      }
    }, [content]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      insertText: (text: string, position?: number) => {
        if (!viewRef.current) return;

        const view = viewRef.current;
        const insertPos = position ?? view.state.doc.content.size;
        const parsedNodes = parseMarkdownText(text);
        
        // Insert the parsed content
        const tr = view.state.tr.replaceWith(
          insertPos,
          insertPos,
          parsedNodes.content
        );
        
        view.dispatch(tr);
      },

      replaceSelection: (text: string) => {
        if (!viewRef.current) return;

        const view = viewRef.current;
        const { from, to } = view.state.selection;
        
        // Simple text replacement without any parsing - just replace with plain text (no marks)
        const textNode = markdownSchema.text(text);
        const tr = view.state.tr.replaceWith(from, to, textNode);
        view.dispatch(tr);
      },

      replaceSelectionWithMarkdown: (text: string) => {
        if (!viewRef.current) return;

        const view = viewRef.current;
        const { from, to } = view.state.selection;
        
        // Parse markdown and replace selection - use full markdown parser for headings
        const parsedDoc = parseMarkdownText(text);
        const tr = view.state.tr.replaceWith(from, to, parsedDoc.content);
        view.dispatch(tr);
      },

      convertToBodyText: () => {
        if (!viewRef.current) return;

        const view = viewRef.current;
        const { from, to } = view.state.selection;
        
        if (from === to) return; // No selection
        
        // Get the selected text content without any formatting
        const selectedText = view.state.doc.textBetween(from, to);
        
        // Replace with plain text (removes all marks and formatting)
        const textNode = markdownSchema.text(selectedText);
        const tr = view.state.tr.replaceWith(from, to, textNode);
        view.dispatch(tr);
      },

      applyMark: (markType: string, text: string) => {
        if (!viewRef.current) return;

        const view = viewRef.current;
        const { from, to } = view.state.selection;
        
        // Create the mark
        const mark = markdownSchema.mark(markType);
        
        // Replace selection with text that has the mark applied
        const textNode = markdownSchema.text(text, [mark]);
        const tr = view.state.tr.replaceWith(from, to, textNode);
        view.dispatch(tr);
      },

      insertAIResponse: (text: string) => {
        if (!viewRef.current || !text || text.trim() === '') return;
        
        const view = viewRef.current;
        const { from } = view.state.selection;
        const cleanText = text.trim();
        
        // Check if we're inside a list item
        const $from = view.state.doc.resolve(from);
        const isInListItem = $from.parent.type.name === 'list_item' || 
          ($from.depth > 1 && $from.node($from.depth - 1).type.name === 'list_item');
        
        // For insertion, only treat lists and code blocks as needing block parsing
        // Headings should be handled as inline formatting for inline insertion
        let needsBlockParsing = BLOCK_MARKDOWN_PATTERN.test(cleanText);
        
        // Special handling: If we're inside a list item and the AI response contains bullet points,
        // we need to handle this carefully to avoid nesting while preserving list structure
        if (isInListItem && needsBlockParsing) {
          const hasBulletPoints = /^\s*[\*\-•]\s/m.test(cleanText);
          const hasOrderedList = /^\s*\d+\.\s/m.test(cleanText);
          
          if (hasBulletPoints || hasOrderedList) {
            // Find the parent list to insert new items at the same level
            let parentListPos = -1;
            let listType = 'bullet_list';
            
            // Walk up the document tree to find the parent list
            for (let depth = $from.depth; depth >= 0; depth--) {
              const node = $from.node(depth);
              if (node.type.name === 'bullet_list' || node.type.name === 'ordered_list') {
                parentListPos = $from.start(depth);
                listType = node.type.name;
                break;
              }
            }
            
            if (parentListPos >= 0) {
              // Parse the AI response as normal to get proper list structure
              const parsedDoc = parseMarkdownText(cleanText);
              
              // Find the list in the parsed document
              let listNode: ProseMirrorNode | null = null;
              parsedDoc.forEach((child) => {
                if (child.type.name === 'bullet_list' || child.type.name === 'ordered_list') {
                  listNode = child;
                }
              });
              
              if (listNode) {
                // Instead of inserting at cursor, replace content at the same list level
                // Find current list item boundaries
                const currentListItemPos = $from.start($from.depth);
                const currentListItemEnd = $from.end($from.depth);
                
                // Replace current list item with the new content
                const tr = view.state.tr.replaceWith(currentListItemPos, currentListItemEnd, listNode.content);
                view.dispatch(tr);
                return;
              }
            }
          }
        }
        
        if (needsBlockParsing) {
          // Use full markdown parsing for block-level content
          const parsedDoc = parseMarkdownText(cleanText);
          const tr = view.state.tr.replaceWith(from, from, parsedDoc.content);
          view.dispatch(tr);
        } else {
          // For inline content, check if it has any formatting (including headings)
          const hasAnyFormatting = /^#+\s|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`/.test(cleanText);
          
          if (hasAnyFormatting) {
            // Use inline parsing for all formatted text (including headings)
            const parsedFragment = parseInlineMarkdown(cleanText);
            const tr = view.state.tr.replaceWith(from, from, parsedFragment);
            view.dispatch(tr);
          } else {
            // For plain text, create a simple text node
            const textNode = markdownSchema.text(cleanText);
            const tr = view.state.tr.replaceWith(from, from, textNode);
            view.dispatch(tr);
          }
        }
      },

      replaceSelectionWithAI: (text: string) => {
        if (!viewRef.current || !text || text.trim() === '') return;

        const view = viewRef.current;
        const { from, to } = view.state.selection;
        const cleanText = text.trim();
        
        // Check if the selection is within a single paragraph/block
        const $from = view.state.doc.resolve(from);
        const $to = view.state.doc.resolve(to);
        const isInSameBlock = $from.sameParent($to);
        
        // Check if we're inside a list item
        const isInListItem = $from.parent.type.name === 'list_item' || 
          ($from.depth > 1 && $from.node($from.depth - 1).type.name === 'list_item');
        
        // For inline replacement, only treat lists and code blocks as needing block parsing
        // Headings should be handled as inline formatting when replacing within same block
        let needsBlockParsing = BLOCK_MARKDOWN_PATTERN.test(cleanText);
        
        // Special handling: If we're inside a list item and the AI response contains bullet points,
        // we need to handle this carefully to avoid nesting while preserving list structure
        if (isInListItem && needsBlockParsing) {
          const hasBulletPoints = /^\s*[\*\-•]\s/m.test(cleanText);
          const hasOrderedList = /^\s*\d+\.\s/m.test(cleanText);
          
          if (hasBulletPoints || hasOrderedList) {
            // Parse the AI response as normal to get proper list structure
            const parsedDoc = parseMarkdownText(cleanText);
            
            // Find the list in the parsed document
            let listNode: ProseMirrorNode | null = null;
            parsedDoc.forEach((child) => {
              if (child.type.name === 'bullet_list' || child.type.name === 'ordered_list') {
                listNode = child;
              }
            });
            
            if (listNode) {
              // For replacement, we want to replace the selected content with new list items
              // at the same level. Find the current list item boundaries.
              const currentListItemPos = $from.start($from.depth);
              const currentListItemEnd = $to.end($to.depth);
              
              // Replace current list item with the new list content
              const tr = view.state.tr.replaceWith(currentListItemPos, currentListItemEnd, listNode.content);
              view.dispatch(tr);
              return;
            }
          }
        }
        
        if (needsBlockParsing || !isInSameBlock) {
          // Use full markdown parsing for block-level content or multi-block selections
          const parsedDoc = parseMarkdownText(cleanText);
          const tr = view.state.tr.replaceWith(from, to, parsedDoc.content);
          view.dispatch(tr);
        } else {
          // For inline replacement within the same block, use inline parsing for all formatting
          // This includes headings, bold, italic, code, etc.
          const hasAnyFormatting = /^#+\s|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`/.test(cleanText);
          
          if (hasAnyFormatting) {
            // Use inline parsing for all formatted text (including headings)
            const parsedFragment = parseInlineMarkdown(cleanText);
            const tr = view.state.tr.replaceWith(from, to, parsedFragment);
            view.dispatch(tr);
          } else {
            // For plain text, create a simple text node
            const textNode = markdownSchema.text(cleanText);
            const tr = view.state.tr.replaceWith(from, to, textNode);
            view.dispatch(tr);
          }
        }
      },

      getContent: () => {
        if (!viewRef.current) return '';
        return proseMirrorToMarkdown(viewRef.current.state.doc);
      },

      getSelectedMarkdown: () => {
        if (!viewRef.current) return '';
        const view = viewRef.current;
        const { from, to } = view.state.selection;
        

        
        if (from === to) return ''; // No selection
        
        try {
          // Find the range of complete nodes that contain our selection
          let startNode = from;
          let endNode = to;
          
          // Expand selection to include complete list items if we're in lists
          const $from = view.state.doc.resolve(from);
          const $to = view.state.doc.resolve(to);
          
          // Check if we're inside list items and expand to include the full list items
          let expandedFrom = from;
          let expandedTo = to;
          
          // Find the start of the first complete node
          for (let depth = $from.depth; depth >= 0; depth--) {
            const node = $from.node(depth);
            const nodeStart = $from.start(depth);
            const nodeEnd = $from.end(depth);
            
            if (node.type.name === 'list_item' || node.type.name === 'bullet_list' || node.type.name === 'ordered_list') {
              expandedFrom = Math.min(expandedFrom, nodeStart);
              break;
            }
          }
          
          // Find the end of the last complete node
          for (let depth = $to.depth; depth >= 0; depth--) {
            const node = $to.node(depth);
            const nodeStart = $to.start(depth);
            const nodeEnd = $to.end(depth);
            
            if (node.type.name === 'list_item' || node.type.name === 'bullet_list' || node.type.name === 'ordered_list') {
              expandedTo = Math.max(expandedTo, nodeEnd);
              break;
            }
          }
          
          
          // Extract the expanded slice
          const selectedSlice = view.state.doc.slice(expandedFrom, expandedTo);
          
          // Create a temporary document with the selected content
          const tempDoc = markdownSchema.node('doc', null, selectedSlice.content);
          
          // Convert to markdown preserving all formatting
          return proseMirrorToMarkdown(tempDoc);
        } catch (error) {
          // Fallback: just return the plain text content
          const selectedText = view.state.doc.textBetween(from, to);
          return selectedText;
        }
      },

      setContent: (newContent: string) => {
        if (!viewRef.current) return;

        const view = viewRef.current;
        const newDoc = newContent ? parseMarkdownText(newContent) : createEmptyDoc();
        
        // Use transaction-based update to prevent DOM recreation and flickering
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
        view.dispatch(tr);
      },

      focus: () => {
        viewRef.current?.focus();
      },

      startStreaming: (position?: number) => {
        if (!viewRef.current) return;

        const pos = position ?? viewRef.current.state.doc.content.size;
        streamingPositionRef.current = pos;
        streamingBufferRef.current = '';

        const tr = viewRef.current.state.tr.setMeta('streaming', { active: true, position: pos });
        viewRef.current.dispatch(tr);
      },

      stopStreaming: () => {
        if (!viewRef.current) return;

        const tr = viewRef.current.state.tr.setMeta('streaming', { active: false });
        viewRef.current.dispatch(tr);
        
        streamingBufferRef.current = '';
      },

      appendStreamingText: (text: string) => {
        if (!viewRef.current) return;

        streamingBufferRef.current += text;
        
        // Parse the accumulated buffer as full markdown for proper heading support
        const parsedDoc = parseMarkdownText(streamingBufferRef.current);
        const view = viewRef.current;
        
        // Replace content from streaming position to end with new parsed content
        const tr = view.state.tr.replaceWith(
          streamingPositionRef.current,
          view.state.doc.content.size,
          parsedDoc.content
        );
        
        view.dispatch(tr);
      },

      getContainerRef: () => containerRef,
    }), []);

    return (
      <div ref={containerRef} className={cn('prosemirror-editor-container', className)}>
        <div
          ref={editorRef}
          className={cn(
            'prosemirror-editor',
            'focus:outline-none',
            'min-h-[200px]',
            'whitespace-pre-wrap',
            'break-words',
            className
          )}
        />
        {placeholder && !content && (
          <div className="absolute top-4 left-4 text-gray-400 pointer-events-none select-none">
            {placeholder}
          </div>
        )}
      </div>
    );
  }
);

ProseMirrorEditor.displayName = 'ProseMirrorEditor';

export default ProseMirrorEditor;