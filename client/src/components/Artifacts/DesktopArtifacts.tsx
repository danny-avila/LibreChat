import { useState, useEffect } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Spinner } from '@librechat/client';
import type { ArtifactsSharedProps, TabOption } from './ArtifactsTypes';
import ArtifactsHeader from './ArtifactsHeader';
import ArtifactTabs from './ArtifactTabs';
import { cn } from '~/utils';

interface DesktopArtifactsProps extends ArtifactsSharedProps {
  tabOptions: TabOption[];
}

export default function DesktopArtifacts({
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
}: DesktopArtifactsProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 30);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setIsVisible(false);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 300);
  };

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} asChild>
      <div
        className={cn(
          'flex h-full w-full flex-col bg-surface-primary text-xl text-text-primary shadow-2xl',
          isVisible && !isClosing
            ? 'duration-350 translate-x-0 opacity-100 transition-all'
            : 'translate-x-5 opacity-0 transition-all duration-300',
        )}
        style={{ overflow: 'hidden' }}
      >
        {/* Header */}
        <div className={cn('flex items-center transition-all duration-500')}>
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
            isMobile={false}
            tabOptions={tabOptions}
          />
        </div>

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
      </div>
    </Tabs.Root>
  );
}
