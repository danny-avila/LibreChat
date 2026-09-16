import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import copy from 'copy-to-clipboard';
import * as Tabs from '@radix-ui/react-tabs';
import { useSetRecoilState, useResetRecoilState } from 'recoil';
import { DEFAULT_ARTIFACT_APPS_CONFIG } from 'librechat-data-provider';
import { Code, Maximize2, Minimize2, Play, RefreshCw, RotateCcw, X } from 'lucide-react';
import {
  Button,
  Spinner,
  TooltipAnchor,
  useMediaQuery,
  useToastContext,
  Radio,
} from '@librechat/client';
import type { SandpackPreviewRef } from '@codesandbox/sandpack-react';
import type { ProcessedMermaidSvg } from '~/utils/diagram/export';
import useClearArtifactNavigationRequest from '~/hooks/Artifacts/useClearArtifactNavigationRequest';
import { TOOL_ARTIFACT_TYPES, isCodeOnlyArtifact, isPreviewOnlyArtifact } from '~/utils/artifacts';
import { captureArtifactPreview, toArtifactPreview } from '~/utils/artifactPreviewCapture';
import { displayFilename } from '~/components/Chat/Messages/Content/Parts/attachmentTypes';
import useArtifactCatalogSync from '~/hooks/Artifacts/useArtifactCatalogSync';
import ArtifactAppShareDialog from '~/components/ArtifactApps/Share';
import CopyButton from '~/components/Messages/Content/CopyButton';
import { useShareContext, useMutationState } from '~/Providers';
import useArtifacts from '~/hooks/Artifacts/useArtifacts';
import { useGetStartupConfig } from '~/data-provider';
import { useFocusTrap, useLocalize } from '~/hooks';
import DownloadArtifact from './DownloadArtifact';
import ArtifactVersion from './ArtifactVersion';
import MermaidExport from './Mermaid/Export';
import ArtifactTabs from './ArtifactTabs';
import { cn, logger } from '~/utils';
import store from '~/store';

const MAX_BLUR_AMOUNT = 32;
const MAX_BACKDROP_OPACITY = 0.3;

export default function Artifacts({ readOnly = false }: { readOnly?: boolean }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { isMutating } = useMutationState();
  const { isSharedConvo, shareId } = useShareContext();
  const isSharedView = readOnly || isSharedConvo === true || Boolean(shareId);
  const isMobile = useMediaQuery('(max-width: 868px)');
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const previewRef = useRef<SandpackPreviewRef>();
  const previewSurfaceRef = useRef<HTMLDivElement>(null);
  const artifactContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenPortalRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [height, setHeight] = useState(90);
  const [isDragging, setIsDragging] = useState(false);
  const [blurAmount, setBlurAmount] = useState(0);
  const [isCopied, setIsCopied] = useState(false);
  const [mermaidExportState, setMermaidExportState] = useState<{
    artifactId: string;
    data: ProcessedMermaidSvg | null;
  } | null>(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(90);
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);
  const setArtifacts = useSetRecoilState(store.artifactsState);
  const clearArtifactNavigationRequest = useClearArtifactNavigationRequest();
  const { data: startupConfig } = useGetStartupConfig();
  const previewCaptureTimeoutMs =
    startupConfig?.artifactApps?.clientPreviewCaptureTimeoutMs ??
    DEFAULT_ARTIFACT_APPS_CONFIG.clientPreviewCaptureTimeoutMs;
  const previewSettleDelayMs =
    startupConfig?.artifactApps?.clientSyncSettleDelayMs ??
    DEFAULT_ARTIFACT_APPS_CONFIG.clientSyncSettleDelayMs;

  const allTabOptions = useMemo(
    () => [
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
    ],
    [localize],
  );

  useEffect(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      openerRef.current = activeElement;
    }
    setIsMounted(true);
    const delay = isMobile ? 50 : 30;
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => {
      clearTimeout(timer);
      setIsMounted(false);
    };
  }, [isMobile]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const container = artifactContainerRef.current;
      setIsFullscreen(container !== null && document.fullscreenElement === container);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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
  const { artifactEntry, isDeleted, restoreArtifact, isSyncing } = useArtifactCatalogSync(
    isSharedView ? null : currentArtifact,
  );

  const restoreArtifactTriggerFocus = useCallback(() => {
    const opener = openerRef.current;
    const artifactId = currentArtifact?.id;
    requestAnimationFrame(() => {
      if (opener?.isConnected) {
        opener.focus();
        return;
      }

      const trigger = Array.from(
        document.querySelectorAll<HTMLElement>('[data-artifact-trigger]'),
      ).find((element) => element.dataset.artifactTrigger === artifactId);
      trigger?.focus();
    });
  }, [currentArtifact?.id]);

  const handleMermaidExportReady = useCallback(
    (data: ProcessedMermaidSvg | null) => {
      if (currentArtifact?.id == null) {
        return;
      }
      setMermaidExportState({ artifactId: currentArtifact.id, data });
    },
    [currentArtifact?.id],
  );

  const mermaidExportData =
    mermaidExportState != null && mermaidExportState.artifactId === currentArtifact?.id
      ? mermaidExportState.data
      : null;
  const isMermaidArtifact = currentArtifact?.type === TOOL_ARTIFACT_TYPES.MERMAID;

  const closeArtifacts = useCallback(() => {
    clearArtifactNavigationRequest();
    if (isMobile) {
      setIsClosing(true);
      setIsVisible(false);
      const finishClose = () => {
        resetCurrentArtifactId();
        setArtifactsVisible(false);
        setIsClosing(false);
        setHeight(90);
        restoreArtifactTriggerFocus();
      };
      if (prefersReducedMotion) {
        finishClose();
      } else {
        setTimeout(finishClose, 250);
      }
      return;
    }

    resetCurrentArtifactId();
    setArtifactsVisible(false);
    restoreArtifactTriggerFocus();
  }, [
    clearArtifactNavigationRequest,
    isMobile,
    prefersReducedMotion,
    resetCurrentArtifactId,
    restoreArtifactTriggerFocus,
    setArtifactsVisible,
  ]);

  useFocusTrap(panelRef, isMobile && isVisible && !isClosing, closeArtifacts);

  /* Office artifacts have no source view, and source-code artifacts have
   * no useful rendered preview. Filter each down to the only meaningful
   * tab and label that tab with the file name instead of generic
   * "Code" / "Preview" choices. */
  const isPreviewOnly = isPreviewOnlyArtifact(currentArtifact?.type);
  const isCodeOnly = isCodeOnlyArtifact(currentArtifact?.type);
  let constrainedTab: 'preview' | 'code' | null = null;
  if (isPreviewOnly) {
    constrainedTab = 'preview';
  } else if (isCodeOnly) {
    constrainedTab = 'code';
  }
  const displayedTab = constrainedTab ?? activeTab;
  const tabOptions = useMemo(() => {
    if (constrainedTab == null) {
      return allTabOptions;
    }
    const filename = displayFilename(currentArtifact?.title);
    const tab = allTabOptions.find((opt) => opt.value === constrainedTab);
    if (!tab) {
      return allTabOptions;
    }
    return [filename ? { ...tab, label: filename } : tab];
  }, [allTabOptions, constrainedTab, currentArtifact?.title]);
  useEffect(() => {
    if (constrainedTab != null && activeTab !== constrainedTab) {
      setActiveTab(constrainedTab);
    }
  }, [constrainedTab, activeTab, setActiveTab]);

  useEffect(() => {
    const artifact = currentArtifact;
    if (!artifact || artifact.preview || displayedTab !== 'preview') {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const surface = previewSurfaceRef.current;
      if (!surface) {
        return;
      }
      void captureArtifactPreview(
        surface,
        isMermaidArtifact ? 'element' : 'frame',
        previewCaptureTimeoutMs,
        controller.signal,
      ).then((imageUrl) => {
        if (!imageUrl || controller.signal.aborted) {
          return;
        }
        const preview = toArtifactPreview(imageUrl, artifact.title?.slice(0, 500));
        if (!preview) {
          return;
        }
        setArtifacts((previous) => {
          const latest = previous?.[artifact.id];
          if (!latest || latest.lastUpdateTime !== artifact.lastUpdateTime || latest.preview) {
            return previous;
          }
          return { ...previous, [artifact.id]: { ...latest, preview } };
        });
      });
    }, previewSettleDelayMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    currentArtifact,
    displayedTab,
    isMermaidArtifact,
    previewCaptureTimeoutMs,
    previewSettleDelayMs,
    setArtifacts,
  ]);

  const handleCopyArtifact = useCallback(() => {
    const content = currentArtifact?.content ?? '';
    if (!content) {
      return;
    }
    copy(content, { format: 'text/plain' });
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  }, [currentArtifact?.content]);

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

  const handleDragKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let nextHeight = height;
    if (e.key === 'ArrowUp') {
      nextHeight = Math.min(100, height + 10);
    } else if (e.key === 'ArrowDown') {
      nextHeight = Math.max(10, height - 10);
    } else if (e.key === 'Home') {
      nextHeight = 10;
    } else if (e.key === 'End') {
      nextHeight = 100;
    } else {
      return;
    }

    e.preventDefault();
    setHeight(nextHeight);
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

  const handleFullscreen = async () => {
    const container = artifactContainerRef.current;
    if (!container) {
      return;
    }

    try {
      if (document.fullscreenElement === container) {
        await document.exitFullscreen();
        return;
      }
      await container.requestFullscreen();
    } catch (error) {
      logger.error('Failed to toggle artifact fullscreen mode:', error);
    }
  };

  const handleRestore = async () => {
    if (!restoreArtifact) {
      return;
    }
    try {
      await restoreArtifact();
      showToast({
        status: 'success',
        message: localize('com_ui_artifact_restore_success'),
      });
    } catch {
      showToast({ status: 'error', message: localize('com_ui_artifact_restore_error') });
    }
  };

  const backdropOpacity =
    blurAmount > 0
      ? (Math.min(blurAmount, MAX_BLUR_AMOUNT) / MAX_BLUR_AMOUNT) * MAX_BACKDROP_OPACITY
      : 0;

  return (
    <Tabs.Root value={displayedTab} onValueChange={setActiveTab} asChild>
      <div ref={artifactContainerRef} className="flex h-full w-full flex-col bg-surface-primary">
        {/* Mobile backdrop with dynamic blur */}
        {isMobile && (
          <div
            className={cn(
              'fixed inset-0 z-[99] bg-black will-change-[opacity,backdrop-filter] motion-reduce:transition-none',
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
          ref={panelRef}
          id="artifact-viewer"
          role={isMobile ? 'dialog' : 'region'}
          aria-modal={isMobile || undefined}
          aria-label={currentArtifact.title ?? localize('com_ui_artifacts')}
          className={cn(
            'flex w-full flex-col bg-surface-primary text-xl text-text-primary motion-reduce:transition-none',
            isMobile
              ? cn(
                  'fixed z-[100] shadow-[0_-10px_60px_rgba(0,0,0,0.35)]',
                  isFullscreen ? 'inset-0 rounded-none' : 'inset-x-0 bottom-0 rounded-t-[20px]',
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
          style={
            isMobile ? { height: isFullscreen ? '100%' : `${height}vh` } : { overflow: 'hidden' }
          }
        >
          {isMobile && !isFullscreen && (
            <div
              role="separator"
              tabIndex={0}
              aria-label={localize('com_ui_resize_artifact_panel')}
              aria-orientation="horizontal"
              aria-valuemin={10}
              aria-valuemax={100}
              aria-valuenow={Math.round(height)}
              className="flex flex-shrink-0 cursor-grab items-center justify-center bg-surface-primary-alt pb-1.5 pt-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-heavy active:cursor-grabbing"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
              onKeyDown={handleDragKeyDown}
            >
              <div className="h-1 w-12 rounded-full bg-border-xheavy opacity-40 transition-all duration-200 active:opacity-60 high-contrast:opacity-100 motion-reduce:transition-none" />
            </div>
          )}

          {/* Header */}
          <div
            className={cn(
              'flex h-[52px] flex-shrink-0 items-center justify-between gap-2 border-b border-border-light bg-surface-primary-alt p-2 transition-all duration-300 motion-reduce:transition-none',
              isMobile ? 'justify-center' : 'overflow-hidden',
            )}
          >
            {!isMobile && (
              <div
                className={cn(
                  'flex items-center transition-all duration-500 motion-reduce:transition-none',
                  isVisible && !isClosing
                    ? 'translate-x-0 opacity-100'
                    : '-translate-x-2 opacity-0',
                )}
              >
                <Radio
                  options={tabOptions}
                  value={displayedTab}
                  onChange={setActiveTab}
                  disabled={isMutating && displayedTab !== 'code'}
                  buttonClassName="h-9 px-3 gap-1.5"
                />
              </div>
            )}

            <div
              className={cn(
                'flex items-center gap-2 transition-all duration-500 motion-reduce:transition-none',
                isMobile ? 'min-w-max' : '',
                isVisible && !isClosing ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0',
              )}
            >
              {/* Refresh drives the Sandpack preview client; the Mermaid
                  renderer has no such client and offers its own retry, so the
                  action would spin over an unchanged diagram. */}
              {displayedTab === 'preview' && !isMermaidArtifact && (
                <TooltipAnchor
                  description={localize('com_ui_refresh')}
                  render={
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9"
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      aria-label={localize('com_ui_refresh')}
                    >
                      {isRefreshing ? (
                        <Spinner size={16} />
                      ) : (
                        <RefreshCw
                          size={16}
                          className="transition-transform duration-200 motion-reduce:transition-none"
                          aria-hidden="true"
                        />
                      )}
                    </Button>
                  }
                />
              )}
              {(displayedTab === 'preview' || isFullscreen) && document.fullscreenEnabled && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={handleFullscreen}
                  aria-label={localize(
                    isFullscreen ? 'com_ui_exit_full_screen' : 'com_ui_enter_full_screen',
                  )}
                >
                  {isFullscreen ? (
                    <Minimize2 size={16} aria-hidden="true" />
                  ) : (
                    <Maximize2 size={16} aria-hidden="true" />
                  )}
                </Button>
              )}
              {displayedTab !== 'preview' && isMutating && (
                <RefreshCw size={16} className="animate-spin text-text-secondary" />
              )}
              {orderedArtifactIds.length > 1 && (
                <ArtifactVersion
                  currentIndex={currentIndex}
                  totalVersions={orderedArtifactIds.length}
                  portalElement={isFullscreen ? fullscreenPortalRef.current : undefined}
                  onVersionChange={(index) => {
                    const target = orderedArtifactIds[index];
                    if (target) {
                      setCurrentArtifactId(target);
                    }
                  }}
                />
              )}
              <CopyButton
                isCopied={isCopied}
                iconOnly
                portalElement={isFullscreen ? fullscreenPortalRef.current : undefined}
                onClick={handleCopyArtifact}
              />
              {isMermaidArtifact && displayedTab === 'preview' && (
                <MermaidExport
                  artifact={currentArtifact}
                  exportData={mermaidExportData}
                  portalElement={isFullscreen ? fullscreenPortalRef.current : undefined}
                />
              )}
              <DownloadArtifact artifact={currentArtifact} />
              {isSyncing && (
                <span
                  className="flex h-9 w-9 items-center justify-center text-text-secondary"
                  aria-label={localize('com_ui_artifact_syncing')}
                >
                  <Spinner size={16} />
                </span>
              )}
              {!isSharedView && artifactEntry && (
                <ArtifactAppShareDialog
                  app={artifactEntry}
                  buttonClassName="border-0 bg-transparent hover:bg-surface-hover"
                />
              )}
              {!isSharedView && isDeleted && restoreArtifact && (
                <TooltipAnchor
                  description={localize('com_ui_artifact_restore')}
                  render={
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9"
                      onClick={() => void handleRestore()}
                      disabled={isSyncing}
                      aria-label={localize('com_ui_artifact_restore')}
                    >
                      {isSyncing ? (
                        <Spinner size={16} />
                      ) : (
                        <RotateCcw size={16} aria-hidden="true" />
                      )}
                    </Button>
                  }
                />
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                onClick={closeArtifacts}
                aria-label={localize('com_ui_close')}
              >
                <X size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-primary">
            <div ref={previewSurfaceRef} className="absolute inset-0 flex flex-col">
              <ArtifactTabs
                artifact={currentArtifact}
                previewRef={previewRef as React.MutableRefObject<SandpackPreviewRef>}
                isSharedConvo={isSharedView}
                onMermaidExportReady={handleMermaidExportReady}
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
                value={displayedTab}
                onChange={setActiveTab}
                disabled={isMutating && displayedTab !== 'code'}
              />
            </div>
          )}
        </div>
        <div
          ref={fullscreenPortalRef}
          className="z-[101]"
          data-testid="artifact-fullscreen-portal"
        />
      </div>
    </Tabs.Root>
  );
}
