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
  delay = 300,
  minLength = 15,
  key = 0,
}: UseDebouncedMermaidOptions) => {
  const [debouncedContent, setDebouncedContent] = useState(content);
  const [shouldRender, setShouldRender] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
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
    }, effectiveDelay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [content, delay, minLength, key]);

  // Reset error count when key changes (retry)
  useEffect(() => {
    setErrorCount(0);
  }, [key]);

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
    }
  }, [result.error, result.svg]);

  // Only show error after multiple failures AND if we should be rendering
  const shouldShowError = shouldRender && errorCount > 2 && result.error;

  return {
    ...result,
    isLoading: result.isLoading || !shouldRender,
    error: shouldShowError ? result.error : undefined,
  };
};

export default useDebouncedMermaid;
