import { useState, useEffect, useRef, useCallback } from 'react';
import { useExpandableState } from '~/admin/hooks';

/**
 * Shared state machine for collapsible sections.
 *
 * Manages expand/collapse state, deferred rendering via `hasEverExpanded`,
 * deferred add-after-expand via `pendingAddRef`, and `config:expand` /
 * `config:collapse` custom DOM event listeners. Follows the page's Expand all
 * and Collapse all (`useExpandableState`).
 */
export function useCollapsibleSection({
  defaultExpanded,
  onAdd,
  revealPaths,
}: {
  defaultExpanded: boolean;
  onAdd?: () => void;
  /** Data paths the section shows: it opens while the tab filter matches one of them or inside them. */
  revealPaths?: readonly string[];
}) {
  const [isExpanded, setIsExpanded] = useExpandableState(defaultExpanded, revealPaths);
  const [hasEverExpanded, setHasEverExpanded] = useState(isExpanded);
  const sectionRef = useRef<HTMLElement>(null);
  const pendingAddRef = useRef(false);

  useEffect(() => {
    if (isExpanded && !hasEverExpanded) setHasEverExpanded(true);
  }, [isExpanded, hasEverExpanded]);

  useEffect(() => {
    if (isExpanded && pendingAddRef.current) {
      if (!hasEverExpanded) return;
      pendingAddRef.current = false;
      requestAnimationFrame(() => onAdd?.());
    }
  }, [isExpanded, hasEverExpanded, onAdd]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const expand = () => setIsExpanded(true);
    const collapse = () => setIsExpanded(false);
    el.addEventListener('config:expand', expand);
    el.addEventListener('config:collapse', collapse);
    return () => {
      el.removeEventListener('config:expand', expand);
      el.removeEventListener('config:collapse', collapse);
    };
  }, [setIsExpanded]);

  const toggle = useCallback(() => setIsExpanded((prev) => !prev), [setIsExpanded]);

  const handleAddClick = useCallback(() => {
    if (!isExpanded) {
      pendingAddRef.current = true;
      setIsExpanded(true);
    } else {
      onAdd?.();
    }
  }, [isExpanded, onAdd, setIsExpanded]);

  return {
    isExpanded,
    hasEverExpanded,
    sectionRef,
    toggle,
    handleAddClick,
  };
}
