import { useRecoilValue } from 'recoil';
import { Search, Lightbulb, Star, MessageCircleDashed } from 'lucide-react';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '~/components/ui';
import { BadgeItem } from '~/common';
import store from '~/store';

interface BadgeRowProps {
  badges: BadgeItem[];
  onChange: (badges: BadgeItem[]) => void;
}

export const badgeIconMap: Record<string, LucideIcon> = {
  deepsearch: Search,
  think: Lightbulb,
  favorites: Star,
  temporary: MessageCircleDashed,
};

export function BadgeRow({ badges, onChange }: BadgeRowProps) {
  const isEditing = useRecoilValue(store.isEditingBadges);
  const [draggedBadge, setDraggedBadge] = useState<BadgeItem | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [mouseX, setMouseX] = useState<number>(0);
  const [offsetX, setOffsetX] = useState<number>(0);
  const badgeRefs = useRef<Record<string, HTMLDivElement>>({});
  const animationFrame = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const calculateInsertIndex = useCallback((): number => {
    if (!draggedBadge) {
      return 0;
    }
    const tempBadges = badges.filter((b) => b.id !== draggedBadge.id);
    const refs = tempBadges.map((b) => badgeRefs.current[b.id]).filter(Boolean);
    if (refs.length === 0) {
      return 0;
    }
    let idx = 0;
    for (let i = 0; i < refs.length; i++) {
      const rect = refs[i].getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      if (mouseX < center) {
        break;
      }
      idx = i + 1;
    }
    return idx;
  }, [mouseX, badges, draggedBadge]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, badge: BadgeItem) => {
      if (!isEditing) {
        return;
      }
      const el = badgeRefs.current[badge.id];
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      setOffsetX(e.clientX - rect.left);
      setMouseX(e.clientX);
      setDraggedBadge(badge);
      setInsertIndex(badges.findIndex((b) => b.id === badge.id));
    },
    [isEditing, badges],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
      animationFrame.current = requestAnimationFrame(() => {
        setMouseX(e.clientX);
        const newInsertIndex = calculateInsertIndex();
        if (newInsertIndex !== insertIndex) {
          setInsertIndex(newInsertIndex);
        }
      });
    },
    [calculateInsertIndex, insertIndex],
  );

  const handleMouseUp = useCallback(() => {
    if (draggedBadge && insertIndex !== null) {
      const newBadges = [...badges.filter((b) => b.id !== draggedBadge.id)];
      newBadges.splice(insertIndex, 0, draggedBadge);
      onChange(newBadges);
    }
    setDraggedBadge(null);
    setInsertIndex(null);
  }, [badges, draggedBadge, insertIndex, onChange]);

  useEffect(() => {
    if (!draggedBadge) {
      return;
    }
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [draggedBadge, handleMouseMove, handleMouseUp]);

  const toggleBadge = useCallback(
    (id: string) => {
      if (isEditing) {
        return;
      }
      const newBadges = badges.map((badge) =>
        badge.id === id ? { ...badge, isActive: !badge.isActive } : badge,
      );
      onChange(newBadges);
    },
    [isEditing, badges, onChange],
  );

  const deleteBadge = useCallback(
    (id: string) => {
      const newBadges = badges.filter((badge) => badge.id !== id);
      onChange(newBadges);
    },
    [badges, onChange],
  );

  const tempBadges = draggedBadge ? badges.filter((b) => b.id !== draggedBadge.id) : badges;

  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-2">
      {tempBadges.map((badge, index) => (
        <React.Fragment key={badge.id}>
          {draggedBadge && insertIndex === index && (
            <div className="app-icon">
              <Badge
                icon={badgeIconMap[draggedBadge.label.toLowerCase()]}
                label={draggedBadge.label}
                isActive={draggedBadge.isActive}
                isEditing
              />
            </div>
          )}
          <div
            ref={(el) => {
              if (el) {
                badgeRefs.current[badge.id] = el;
              }
            }}
            onMouseDown={(e) => handleMouseDown(e, badge)}
            className={isEditing ? 'ios-wiggle app-icon' : 'app-icon'}
          >
            <Badge
              icon={badgeIconMap[badge.label.toLowerCase()]}
              label={badge.label}
              isActive={badge.isActive}
              isEditing={isEditing}
              onClick={(e) => {
                e.stopPropagation();
                toggleBadge(badge.id);
              }}
              onDelete={() => deleteBadge(badge.id)}
            />
          </div>
        </React.Fragment>
      ))}
      {draggedBadge && insertIndex === tempBadges.length && (
        <div className="app-icon">
          <Badge
            icon={badgeIconMap[draggedBadge.label.toLowerCase()]}
            label={draggedBadge.label}
            isActive={draggedBadge.isActive}
            isEditing
          />
        </div>
      )}
      {draggedBadge && (
        <div
          className="ghost-badge"
          style={{
            position: 'absolute',
            top: 0,
            left: containerRef.current
              ? mouseX - offsetX - containerRef.current.getBoundingClientRect().left
              : mouseX - offsetX,
            zIndex: 10,
          }}
        >
          <Badge
            icon={badgeIconMap[draggedBadge.label.toLowerCase()]}
            label={draggedBadge.label}
            isActive={draggedBadge.isActive}
            isEditing
            isDragging
          />
        </div>
      )}
    </div>
  );
}
