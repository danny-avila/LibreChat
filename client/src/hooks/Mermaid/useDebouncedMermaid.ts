import { useEffect, useState, useRef } from 'react';
import { useMermaid } from './useMermaid';

/**
 * Detect if mermaid content is likely incomplete (still streaming)
 */
const isLikelyStreaming = (content: string): boolean => {
  if (content.length < 15) {
    return true;
  }

  const incompletePatterns = [
    /\[\s*$/, // Ends with opening bracket: "A["
    /--+$/, // Ends with arrows: "A--"
    />>+$/, // Ends with sequence arrow: "A>>"
    /-\|$/, // Ends with arrow: "A-|"
    /\|\s*$/, // Ends with pipe: "A|"
    /^\s*graph\s+[A-Z]*$/, // Just "graph TD" or "graph"
    /^\s*sequenceDiagram\s*$/, // Just "sequenceDiagram"
    /^\s*flowchart\s+[A-Z]*$/, // Just "flowchart TD"
    /^\s*classDiagram\s*$/, // Just "classDiagram"
    /^\s*stateDiagram\s*$/, // Just "stateDiagram"
    /^\s*erDiagram\s*$/, // Just "erDiagram"
    /^\s*gantt\s*$/, // Just "gantt"
    /^\s*pie\s*$/, // Just "pie"
    /:\s*$/, // Ends with colon (incomplete label)
    /"\s*$/, // Ends with unclosed quote
  ];

  return incompletePatterns.some((pattern) => pattern.test(content));
};

/**
 * Detect if content looks complete (has closing structure)
 */
const looksComplete = (content: string): boolean => {
  const lines = content.trim().split('\n');
  if (lines.length < 2) {
    return false;
  }

  // Has complete node connections (flowchart/graph)
  const hasConnections =
    /[A-Za-z]\w*(\[.*?\]|\(.*?\)|\{.*?\})?(\s*--+>?\s*|\s*-+\.\s*|\s*==+>?\s*)[A-Za-z]\w*/.test(
      content,
    );

  // Has sequence diagram messages
  const hasSequenceMessages = /\w+-+>>?\+?\w+:/.test(content);

  // Has class diagram relations
  const hasClassRelations = /\w+\s*(<\|--|--|\.\.>|--\*|--o)\s*\w+/.test(content);

  // Has state transitions
  const hasStateTransitions = /\[\*\]\s*-->|\w+\s*-->\s*\w+/.test(content);

  // Has ER diagram relations
  const hasERRelations = /\w+\s*\|\|--o\{|\w+\s*}o--\|\|/.test(content);

  // Has gantt tasks
  const hasGanttTasks = /^\s*\w+\s*:\s*\w+/.test(content);

  return (
    hasConnections ||
    hasSequenceMessages ||
    hasClassRelations ||
    hasStateTransitions ||
    hasERRelations ||
    hasGanttTasks
  );
};

interface UseDebouncedMermaidOptions {
  /** Mermaid diagram content */
  content: string;
  /** Unique identifier */
  id?: string;
  /** Custom theme */
  theme?: string;
  /** Delay before attempting render (ms) */
  delay?: number;
  /** Minimum content length before attempting render */
  minLength?: number;
  /** Key to force re-render (e.g., for retry functionality) */
  key?: number;
}

export const useDebouncedMermaid = ({
  content,
  id,
  theme,
  delay = 500,
  minLength = 15,
  key = 0,
}: UseDebouncedMermaidOptions) => {
  // Check if content looks complete on initial mount or when content changes significantly
  // Using refs to capture state and detect significant content changes (e.g., user edits message)
  const initialCheckRef = useRef<boolean | null>(null);
  const contentLengthRef = useRef(content.length);

  // Reset check if content length changed significantly (more than 20% difference)
  const lengthDiff = Math.abs(content.length - contentLengthRef.current);
  const significantChange = lengthDiff > contentLengthRef.current * 0.2 && lengthDiff > 50;

  if (initialCheckRef.current === null || significantChange) {
    contentLengthRef.current = content.length;
    initialCheckRef.current =
      content.length >= minLength && looksComplete(content) && !isLikelyStreaming(content);
  }
  const isInitiallyComplete = initialCheckRef.current;

  const [debouncedContent, setDebouncedContent] = useState(content);
  const [shouldRender, setShouldRender] = useState(isInitiallyComplete);
  const [errorCount, setErrorCount] = useState(0);
  const [forceRender, setForceRender] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const prevKeyRef = useRef(key);
  const hasRenderedRef = useRef(isInitiallyComplete);

  // When key changes (retry), force immediate render
  useEffect(() => {
    if (key !== prevKeyRef.current) {
      prevKeyRef.current = key;
      setForceRender(true);
      setDebouncedContent(content);
      setShouldRender(true);
      setErrorCount(0);
    }
  }, [key, content]);

  useEffect(() => {
    // Skip debounce logic if force render is active or already rendered initially
    if (forceRender) {
      return;
    }

    // If we already rendered on mount, skip the initial debounce
    if (hasRenderedRef.current && shouldRender) {
      // Content changed after initial render, apply normal debounce for updates
      if (content !== debouncedContent) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        const effectiveDelay = looksComplete(content) ? delay / 2 : delay;
        timeoutRef.current = setTimeout(() => {
          setDebouncedContent(content);
        }, effectiveDelay);
      }
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Don't render if too short or obviously incomplete
    if (content.length < minLength || (isLikelyStreaming(content) && !looksComplete(content))) {
      setShouldRender(false);
      return;
    }

    // Use shorter delay if content looks complete
    const effectiveDelay = looksComplete(content) ? delay / 2 : delay;

    timeoutRef.current = setTimeout(() => {
      setDebouncedContent(content);
      setShouldRender(true);
      hasRenderedRef.current = true;
    }, effectiveDelay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [content, delay, minLength, forceRender, shouldRender, debouncedContent]);

  const result = useMermaid({
    content: shouldRender ? debouncedContent : '',
    id: id ? `${id}-${key}` : undefined,
    theme,
  });

  // Track error count
  useEffect(() => {
    if (result.error) {
      setErrorCount((prev) => prev + 1);
    } else if (result.svg) {
      setErrorCount(0);
      setForceRender(false);
    }
  }, [result.error, result.svg]);

  // Show error after multiple failures OR if forced render (retry) with error
  const shouldShowError = shouldRender && result.error && (errorCount > 2 || forceRender);

  return {
    ...result,
    isLoading: result.isLoading || !shouldRender,
    error: shouldShowError ? result.error : undefined,
  };
};

export default useDebouncedMermaid;
