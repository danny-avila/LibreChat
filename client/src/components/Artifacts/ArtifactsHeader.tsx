import { RefreshCw, X } from 'lucide-react';
import { Button, Spinner, Radio } from '@librechat/client';
import type { TabOption } from './ArtifactsTypes';
import DownloadArtifact from './DownloadArtifact';
import ArtifactVersion from './ArtifactVersion';
import { CopyCodeButton } from './Code';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import type { Artifact } from '~/common';

interface ArtifactsHeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentIndex: number;
  orderedArtifactIds: string[];
  setCurrentArtifactId: (id: string) => void;
  currentArtifact: Artifact;
  isMutating: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onClose: () => void;
  isMobile?: boolean;
  tabOptions: TabOption[];
}

export default function ArtifactsHeader({
  activeTab,
  setActiveTab,
  currentIndex,
  orderedArtifactIds,
  setCurrentArtifactId,
  currentArtifact,
  isMutating,
  isRefreshing,
  onRefresh,
  onClose,
  isMobile = false,
  tabOptions,
}: ArtifactsHeaderProps) {
  const localize = useLocalize();

  return (
    <div
      className={cn(
        'flex flex-shrink-0 items-center justify-between gap-2 border-b border-border-light bg-surface-primary-alt px-3 py-2 transition-all duration-300',
        isMobile ? 'justify-center' : 'w-full overflow-hidden',
      )}
    >
      {!isMobile && (
        <div className="flex items-center transition-all duration-500">
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
        )}
      >
        {activeTab === 'preview' && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onRefresh}
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
        <Button size="icon" variant="ghost" onClick={onClose} aria-label={localize('com_ui_close')}>
          <X size={16} />
        </Button>
      </div>
    </div>
  );
}
