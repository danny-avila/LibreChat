import { useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type * as t from '~/admin/types';

/** How far an arrow key moves a lifted item. */
const ARROW_STEPS: Record<string, number> = { ArrowUp: -1, ArrowDown: 1 };

/** Moves one item of a list to another position, returning a new list. */
export function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

interface SortableItemState {
  isDragged: boolean;
  isSelected: boolean;
}

export interface SortableListProps<T extends { id: string }> {
  values: T[];
  onChange: (move: { oldIndex: number; newIndex: number }) => void;
  disabled?: boolean;
  voiceover: t.ReorderVoiceover;
  /** Announces each step of a keyboard move to screen readers. */
  announce: (message: string) => void;
  renderItem: (item: T, state: SortableItemState, handle: ReactNode) => ReactNode;
  handle: ReactNode;
  className?: string;
}

/**
 * A list its items can be reordered in, by dragging an item's handle or from the keyboard:
 * Space or Enter lifts the focused item, the arrow keys move it, Space or Enter drops it and
 * Escape puts it back. Each step is announced, as react-movable (which the panel used) did.
 */
export function SortableList<T extends { id: string }>({
  values,
  onChange,
  disabled,
  voiceover,
  announce,
  renderItem,
  handle,
  className,
}: SortableListProps<T>) {
  const [lifted, setLifted] = useState<{ id: string; from: number } | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, index: number, item: T) => {
    if (disabled || event.target !== event.currentTarget) {
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (lifted) {
        announce(voiceover.dropped(lifted.from + 1, index + 1));
        setLifted(null);
      } else {
        setLifted({ id: item.id, from: index });
        announce(voiceover.lifted(index + 1));
      }
      return;
    }
    if (!lifted) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (index !== lifted.from) {
        onChange({ oldIndex: index, newIndex: lifted.from });
      }
      announce(voiceover.canceled(lifted.from + 1));
      setLifted(null);
      return;
    }
    const step = ARROW_STEPS[event.key] ?? 0;
    const target = index + step;
    if (step !== 0 && target >= 0 && target < values.length) {
      event.preventDefault();
      onChange({ oldIndex: index, newIndex: target });
      announce(voiceover.moved(target + 1, step < 0));
    }
  };

  return (
    <div role="list" className={className}>
      {values.map((item, index) => (
        <div
          key={item.id}
          role="listitem"
          tabIndex={disabled ? -1 : 0}
          aria-label={lifted?.id === item.id ? voiceover.lifted(index + 1) : undefined}
          data-item-id={item.id}
          onKeyDown={(event) => onKeyDown(event, index, item)}
          onBlur={() => {
            if (lifted?.id === item.id) {
              setLifted(null);
            }
          }}
          onDragOver={(event) => {
            if (dragFrom.current === null || disabled) {
              return;
            }
            event.preventDefault();
            if (dragFrom.current !== index) {
              onChange({ oldIndex: dragFrom.current, newIndex: index });
              dragFrom.current = index;
            }
          }}
          onDrop={(event) => event.preventDefault()}
        >
          {renderItem(
            item,
            { isDragged: dragged === item.id, isSelected: lifted?.id === item.id },
            <span
              draggable={!disabled}
              onDragStart={(event) => {
                dragFrom.current = index;
                setDragged(item.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', item.id);
              }}
              onDragEnd={() => {
                dragFrom.current = null;
                setDragged(null);
              }}
            >
              {handle}
            </span>,
          )}
        </div>
      ))}
    </div>
  );
}
