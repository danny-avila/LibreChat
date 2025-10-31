import { useRef, useState, useEffect } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Spinner, Radio } from '@librechat/client';
import type { ArtifactsSharedProps, TabOption } from './ArtifactsTypes';
import ArtifactsHeader from './ArtifactsHeader';
import ArtifactTabs from './ArtifactTabs';
import { cn } from '~/utils';

const MAX_BLUR_AMOUNT = 32;
const MAX_BACKDROP_OPACITY = 0.3;

interface MobileArtifactsProps extends ArtifactsSharedProps {
  tabOptions: TabOption[];
}

export default function MobileArtifacts({
  currentArtifact,
  activeTab,
  setActiveTab,
  currentIndex,
  orderedArtifactIds,
  setCurrentArtifactId,
  editorRef,
  previewRef,
  isMutating,
  onClose,
  onRefresh,
  isRefreshing,
  tabOptions,
}: MobileArtifactsProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [height, setHeight] = useState(90);
  const [isDragging, setIsDragging] = useState(false);
  const [blurAmount, setBlurAmount] = useState(0);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(90);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const minHeightForBlur = 50;
    const maxHeightForBlur = 100;

    if (height <= minHeightForBlur) {
      setBlurAmount(0);
    } else if (height >= maxHeightForBlur) {
      setBlurAmount(MAX_BLUR_AMOUNT);
    } else {
      const progress = (height - minHeightForBlur) / (maxHeightForBlur - minHeightForBlur);
      setBlurAmount(Math.round(progress * MAX_BLUR_AMOUNT));
    }
  }, [height]);

  const handleDragStart = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartHeight.current = height;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (!isDragging) {
      return;
    }

    const deltaY = dragStartY.current - e.clientY;
    const viewportHeight = window.innerHeight;
    const deltaPercentage = (deltaY / viewportHeight) * 100;
    const newHeight = Math.max(10, Math.min(100, dragStartHeight.current + deltaPercentage));

    setHeight(newHeight);
  };

  const handleDragEnd = (e: React.PointerEvent) => {
    if (!isDragging) {
      return;
    }

    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    // Snap to positions based on final height
    if (height < 30) {
      handleClose();
    } else if (height > 95) {
      setHeight(100);
    } else if (height < 60) {
      setHeight(50);
    } else {
      setHeight(90);
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setIsVisible(false);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
      setHeight(90);
    }, 250);
  };

  const backdropOpacity =
    blurAmount > 0
      ? (Math.min(blurAmount, MAX_BLUR_AMOUNT) / MAX_BLUR_AMOUNT) * MAX_BACKDROP_OPACITY
      : 0;

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} asChild>
      <div className="flex h-full w-full flex-col">
        {/* Mobile backdrop with dynamic blur */}
        <div
          className={cn(
            'fixed inset-0 z-[99] bg-black will-change-[opacity,backdrop-filter]',
            isVisible && !isClosing
              ? 'transition-all duration-300'
              : 'pointer-events-none opacity-0 backdrop-blur-none transition-opacity duration-150',
            blurAmount < 8 && isVisible && !isClosing ? 'pointer-events-none' : '',
          )}
          style={{
            opacity: isVisible && !isClosing ? backdropOpacity : 0,
            backdropFilter: isVisible && !isClosing ? `blur(${blurAmount}px)` : 'none',
            WebkitBackdropFilter: isVisible && !isClosing ? `blur(${blurAmount}px)` : 'none',
          }}
          onClick={blurAmount >= 8 ? handleClose : undefined}
          aria-hidden="true"
        />

        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-[100] flex w-full flex-col rounded-t-[20px] bg-surface-primary text-xl text-text-primary shadow-[0_-10px_60px_rgba(0,0,0,0.35)]',
            isVisible && !isClosing
              ? 'translate-y-0 opacity-100'
              : 'duration-250 translate-y-full opacity-0 transition-all',
            isDragging ? '' : 'transition-all duration-300',
          )}
          style={{ height: `${height}vh` }}
        >
          {/* Drag handle */}
          <div
            className="flex flex-shrink-0 cursor-grab items-center justify-center bg-surface-primary-alt pb-1.5 pt-2.5 active:cursor-grabbing"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
          >
            <div className="h-1 w-12 rounded-full bg-border-xheavy opacity-40 transition-all duration-200 active:opacity-60" />
          </div>

          {/* Header */}
          <ArtifactsHeader
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            currentIndex={currentIndex}
            orderedArtifactIds={orderedArtifactIds}
            setCurrentArtifactId={setCurrentArtifactId}
            currentArtifact={currentArtifact}
            isMutating={isMutating}
            isRefreshing={isRefreshing}
            onRefresh={onRefresh}
            onClose={handleClose}
            isMobile={true}
            tabOptions={tabOptions}
          />

          {/* Content */}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-primary">
            <div className="absolute inset-0 flex flex-col">
              <ArtifactTabs
                artifact={currentArtifact}
                editorRef={editorRef}
                previewRef={previewRef}
              />
            </div>

            {/* Refresh overlay */}
            <div
              className={cn(
                'absolute inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300 ease-in-out',
                isRefreshing ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
              )}
              aria-hidden={!isRefreshing}
              role="status"
            >
              <div
                className={cn(
                  'transition-transform duration-300 ease-in-out',
                  isRefreshing ? 'scale-100' : 'scale-95',
                )}
              >
                <Spinner size={24} />
              </div>
            </div>
          </div>

          {/* Bottom tabs */}
          <div className="flex-shrink-0 border-t border-border-light bg-surface-primary-alt p-2">
            <Radio
              fullWidth
              options={tabOptions}
              value={activeTab}
              onChange={setActiveTab}
              disabled={isMutating && activeTab !== 'code'}
            />
          </div>
        </div>
      </div>
    </Tabs.Root>
  );
}
