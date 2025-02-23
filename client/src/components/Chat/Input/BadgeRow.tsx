import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRecoilValue, useRecoilCallback } from 'recoil';
import type { LucideIcon } from 'lucide-react';
import { useChatBadges } from '~/hooks';
import { Badge } from '~/components/ui';
import { BadgeItem } from '~/common';
import store from '~/store';

interface BadgeRowProps {
  onChange: (badges: Pick<BadgeItem, 'id'>[]) => void;
  onToggle?: (badgeId: string, currentActive: boolean) => void;
}

export function BadgeRow({ onChange, onToggle }: BadgeRowProps) {
  const allBadges = useChatBadges() || [];
  const badges = useMemo(
    () => allBadges.filter((badge) => badge.isAvailable !== false),
    [allBadges],
  );

  const isEditing = useRecoilValue(store.isEditingBadges);
  const [draggedBadge, setDraggedBadge] = useState<BadgeItem | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [mouseX, setMouseX] = useState<number>(0);
  const [offsetX, setOffsetX] = useState<number>(0);
  const badgeRefs = useRef<Record<string, HTMLDivElement>>({});
  const animationFrame = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestInsertIndexRef = useRef<number | null>(null);

  const isTemporaryActive = useRecoilValue(store.isTemporary);
  const codeArtifactsActive = useRecoilValue(store.codeArtifacts);

  // Create a lookup for the active state by id
  const globalBadgeState: Record<string, boolean> = {
    '1': isTemporaryActive,
    '2': codeArtifactsActive,
  };

  const badgeStates = badges.map((badge) => ({
    ...badge,
    isActive: globalBadgeState[badge.id] ?? false,
  }));

  const toggleBadge = useRecoilCallback(
    ({ snapshot, set }) =>
      async (badgeAtom: any) => {
        const current = await snapshot.getPromise(badgeAtom);
        set(badgeAtom, !current);
      },
    [],
  );

  const calculateInsertIndex = useCallback((): number => {
    if (!draggedBadge || !containerRef.current) {
      return 0;
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    const relativeMouseX = mouseX - containerRect.left;
    const tempBadges = badges.filter((b) => b.id !== draggedBadge.id);
    const refs = tempBadges.map((b) => badgeRefs.current[b.id]).filter(Boolean);
    if (refs.length === 0) {
      return 0;
    }
    let idx = 0;
    for (let i = 0; i < refs.length; i++) {
      const rect = refs[i].getBoundingClientRect();
      const relativeLeft = rect.left - containerRect.left;
      const relativeCenter = relativeLeft + rect.width / 2;
      if (relativeMouseX < relativeCenter) {
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
      const initialIndex = badges.findIndex((b) => b.id === badge.id);
      setInsertIndex(initialIndex);
      latestInsertIndexRef.current = initialIndex;
    },
    [isEditing, badges],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggedBadge) {
        return;
      }
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
      animationFrame.current = requestAnimationFrame(() => {
        setMouseX(e.clientX);
        const newInsertIndex = calculateInsertIndex();
        latestInsertIndexRef.current = newInsertIndex;
        if (newInsertIndex !== insertIndex) {
          setInsertIndex(newInsertIndex);
        }
      });
    },
    [calculateInsertIndex, insertIndex, draggedBadge],
  );

  const handleMouseUp = useCallback(() => {
    const finalInsertIndex =
      latestInsertIndexRef.current !== null ? latestInsertIndexRef.current : insertIndex;
    if (draggedBadge && finalInsertIndex !== null) {
      const otherBadges = badges.filter((b) => b.id !== draggedBadge.id);
      const newBadges = [
        ...otherBadges.slice(0, finalInsertIndex),
        draggedBadge,
        ...otherBadges.slice(finalInsertIndex),
      ];
      onChange(newBadges.map((badge) => ({ id: badge.id })));
    }
    setDraggedBadge(null);
    setInsertIndex(null);
    setOffsetX(0);
    latestInsertIndexRef.current = null;
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

  const handleDelete = useCallback(
    (badgeId: string) => {
      const newBadges = badges.filter((b) => b.id !== badgeId);
      onChange(newBadges.map((badge) => ({ id: badge.id })));
    },
    [badges, onChange],
  );

  const handleBadgeToggle = useCallback(
    (badge: BadgeItem) => {
      if (badge.atom) {
        toggleBadge(badge.atom);
      }
      if (onToggle) {
        onToggle(badge.id, !!badge.atom);
      }
    },
    [toggleBadge, onToggle],
  );

  const tempBadges = draggedBadge
    ? badgeStates.filter((b) => b.id !== draggedBadge.id)
    : badgeStates;
  const ghostBadge = draggedBadge
    ? badgeStates.find((b) => b.id === draggedBadge.id) || null
    : null;

  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-2">
      {tempBadges.map((badge, index) => (
        <React.Fragment key={badge.id}>
          {draggedBadge && insertIndex === index && (
            <div className="app-icon">
              <Badge
                icon={badge.icon as LucideIcon}
                label={badge.label}
                isActive={badge.isActive}
                isEditing={isEditing}
                isAvailable={badge.isAvailable}
                onToggle={() => handleBadgeToggle(badge)}
                onBadgeAction={() => handleDelete(badge.id)}
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
              icon={badge.icon as LucideIcon}
              label={badge.label}
              isActive={badge.isActive}
              isEditing={isEditing}
              isAvailable={badge.isAvailable}
              onToggle={() => handleBadgeToggle(badge)}
              onBadgeAction={() => handleDelete(badge.id)}
            />
          </div>
        </React.Fragment>
      ))}
      {draggedBadge && insertIndex === tempBadges.length && ghostBadge && (
        <div className="app-icon">
          <Badge
            icon={ghostBadge.icon as LucideIcon}
            label={ghostBadge.label}
            isActive={ghostBadge.isActive}
            isAvailable={ghostBadge.isAvailable}
            isEditing
          />
        </div>
      )}
      {ghostBadge && (
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
            icon={ghostBadge.icon as LucideIcon}
            label={ghostBadge.label}
            isActive={ghostBadge.isActive}
            isAvailable={ghostBadge.isAvailable}
            isEditing
            isDragging
          />
        </div>
      )}
    </div>
  );
}
