import { useRef, useState, useEffect } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Code, Play, RefreshCw, X } from 'lucide-react';
import { useSetRecoilState, useResetRecoilState } from 'recoil';
import { Button, Spinner, useMediaQuery, Radio } from '@librechat/client';
import type { SandpackPreviewRef, CodeEditorRef } from '@codesandbox/sandpack-react';
import { useShareContext, useMutationState } from '~/Providers';
import useArtifacts from '~/hooks/Artifacts/useArtifacts';
import DownloadArtifact from './DownloadArtifact';
import ArtifactVersion from './ArtifactVersion';
import ArtifactTabs from './ArtifactTabs';
import { CopyCodeButton } from './Code';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const MAX_BLUR_AMOUNT = 32;
const MAX_BACKDROP_OPACITY = 0.3;

export default function Artifacts() {
  const localize = useLocalize();
  const { isMutating } = useMutationState();
  const { isSharedConvo } = useShareContext();
  const isMobile = useMediaQuery('(max-width: 868px)');
  const editorRef = useRef<CodeEditorRef>();
  const previewRef = useRef<SandpackPreviewRef>();
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [height, setHeight] = useState(90);
  const [isDragging, setIsDragging] = useState(false);
  const [blurAmount, setBlurAmount] = useState(0);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(90);
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);

  const tabOptions = [
    {
      value: 'code',
      label: localize('com_ui_code'),
      icon: <Code className="size-4" />,
    },
    {
      value: 'preview',
      label: localize('com_ui_preview'),
      icon: <Play className="size-4" />,
    },
  ];

  useEffect(() => {
    setIsMounted(true);
    const delay = isMobile ? 50 : 30;
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => {
      clearTimeout(timer);
      setIsMounted(false);
    };
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) {
      setBlurAmount(0);
      return;
    }

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
  }, [height, isMobile]);

  const {
    activeTab,
    setActiveTab,
    currentIndex,
    currentArtifact,
    orderedArtifactIds,
    setCurrentArtifactId,
  } = useArtifacts();

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
      closeArtifacts();
    } else if (height > 95) {
      setHeight(100);
    } else if (height < 60) {
      setHeight(50);
    } else {
      setHeight(90);
    }
  };

  if (!currentArtifact || !isMounted) {
    return null;
  }

  const handleRefresh = () => {
    setIsRefreshing(true);
    const client = previewRef.current?.getClient();
    if (client) {
      client.dispatch({ type: 'refresh' });
    }
    setTimeout(() => setIsRefreshing(false), 750);
  };

  const closeArtifacts = () => {
    if (isMobile) {
      setIsClosing(true);
      setIsVisible(false);
      setTimeout(() => {
        setArtifactsVisible(false);
        setIsClosing(false);
        setHeight(90);
      }, 250);
    } else {
      resetCurrentArtifactId();
      setArtifactsVisible(false);
    }
  };

  const backdropOpacity =
    blurAmount > 0
      ? (Math.min(blurAmount, MAX_BLUR_AMOUNT) / MAX_BLUR_AMOUNT) * MAX_BACKDROP_OPACITY
      : 0;

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} asChild>
      <div className="flex h-full w-full flex-col">
        {/* Mobile backdrop with dynamic blur */}
        {isMobile && (
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
            onClick={blurAmount >= 8 ? closeArtifacts : undefined}
            aria-hidden="true"
          />
        )}
        <div
          className={cn(
            'flex w-full flex-col bg-surface-primary text-xl text-text-primary',
            isMobile
              ? cn(
                  'fixed inset-x-0 bottom-0 z-[100] rounded-t-[20px] shadow-[0_-10px_60px_rgba(0,0,0,0.35)]',
                  isVisible && !isClosing
                    ? 'translate-y-0 opacity-100'
                    : 'duration-250 translate-y-full opacity-0 transition-all',
                  isDragging ? '' : 'transition-all duration-300',
                )
              : cn(
                  'h-full shadow-2xl',
                  isVisible && !isClosing
                    ? 'duration-350 translate-x-0 opacity-100 transition-all'
                    : 'translate-x-5 opacity-0 transition-all duration-300',
                ),
          )}
          style={isMobile ? { height: `${height}vh` } : { overflow: 'hidden' }}
        >
          {isMobile && (
            <div
              className="flex flex-shrink-0 cursor-grab items-center justify-center bg-surface-primary-alt pb-1.5 pt-2.5 active:cursor-grabbing"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
            >
              <div className="h-1 w-12 rounded-full bg-border-xheavy opacity-40 transition-all duration-200 active:opacity-60" />
            </div>
          )}

          {/* Header */}
          <div
            className={cn(
              'flex flex-shrink-0 items-center justify-between gap-2 border-b border-border-light bg-surface-primary-alt px-3 py-2 transition-all duration-300',
              isMobile ? 'justify-center' : 'overflow-hidden',
            )}
          >
            {!isMobile && (
              <div
                className={cn(
                  'flex items-center transition-all duration-500',
                  isVisible && !isClosing
                    ? 'translate-x-0 opacity-100'
                    : '-translate-x-2 opacity-0',
                )}
              >
                <Radio
                  options={tabOptions}
                  value={activeTab}
                  onChange={setActiveTab}
                  disabled={isMutating && activeTab !== 'code'}
                />
              </div>
            )}

            <div
              className={cn(
                'flex items-center gap-2 transition-all duration-500',
                isMobile ? 'min-w-max' : '',
                isVisible && !isClosing ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0',
              )}
            >
              {activeTab === 'preview' && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  aria-label={localize('com_ui_refresh')}
                >
                  {isRefreshing ? (
                    <Spinner size={16} />
                  ) : (
                    <RefreshCw size={16} className="transition-transform duration-200" />
                  )}
                </Button>
              )}
              {activeTab !== 'preview' && isMutating && (
                <RefreshCw size={16} className="animate-spin text-text-secondary" />
              )}
              {orderedArtifactIds.length > 1 && (
                <ArtifactVersion
                  currentIndex={currentIndex}
                  totalVersions={orderedArtifactIds.length}
                  onVersionChange={(index) => {
                    const target = orderedArtifactIds[index];
                    if (target) {
                      setCurrentArtifactId(target);
                    }
                  }}
                />
              )}
              <CopyCodeButton content={currentArtifact.content ?? ''} />
              <DownloadArtifact artifact={currentArtifact} />
              <Button
                size="icon"
                variant="ghost"
                onClick={closeArtifacts}
                aria-label={localize('com_ui_close')}
              >
                <X size={16} />
              </Button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-primary">
            <div className="absolute inset-0 flex flex-col">
              <ArtifactTabs
                artifact={currentArtifact}
                editorRef={editorRef as React.MutableRefObject<CodeEditorRef>}
                previewRef={previewRef as React.MutableRefObject<SandpackPreviewRef>}
                isSharedConvo={isSharedConvo}
              />
            </div>

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

          {isMobile && (
            <div className="flex-shrink-0 border-t border-border-light bg-surface-primary-alt p-2">
              <Radio
                fullWidth
                options={tabOptions}
                value={activeTab}
                onChange={setActiveTab}
                disabled={isMutating && activeTab !== 'code'}
              />
            </div>
          )}
        </div>
      </div>
    </Tabs.Root>
  );
}
