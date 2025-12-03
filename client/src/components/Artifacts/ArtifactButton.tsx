import { useEffect, useRef } from 'react';
import debounce from 'lodash/debounce';
import { useLocation } from 'react-router-dom';
import { useRecoilState, useSetRecoilState, useResetRecoilState } from 'recoil';
import type { Artifact } from '~/common';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { cn, getFileType, logger, isArtifactRoute } from '~/utils';
import { useLocalize } from '~/hooks';
import store from '~/store';

const ArtifactButton = ({ artifact }: { artifact: Artifact | null }) => {
  const localize = useLocalize();
  const location = useLocation();
  const setVisible = useSetRecoilState(store.artifactsVisibility);
  const [artifacts, setArtifacts] = useRecoilState(store.artifactsState);
  const [currentArtifactId, setCurrentArtifactId] = useRecoilState(store.currentArtifactId);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);
  const isSelected = artifact?.id === currentArtifactId;
  const [visibleArtifacts, setVisibleArtifacts] = useRecoilState(store.visibleArtifacts);

  const debouncedSetVisibleRef = useRef(
    debounce((artifactToSet: Artifact) => {
      logger.log(
        'artifacts_visibility',
        'Setting artifact to visible state from Artifact button',
        artifactToSet,
      );
      setVisibleArtifacts((prev) => ({
        ...prev,
        [artifactToSet.id]: artifactToSet,
      }));
    }, 750),
  );

  useEffect(() => {
    if (artifact == null || artifact?.id == null || artifact.id === '') {
      return;
    }

    if (!isArtifactRoute(location.pathname)) {
      return;
    }

    const debouncedSetVisible = debouncedSetVisibleRef.current;
    debouncedSetVisible(artifact);
    return () => {
      debouncedSetVisible.cancel();
    };
  }, [artifact, location.pathname]);

  if (artifact === null || artifact === undefined) {
    return null;
  }
  const fileType = getFileType('artifact');

  return (
    <div className="group relative my-4 rounded-xl text-sm text-text-primary">
      {(() => {
        const handleClick = () => {
          if (isSelected) {
            resetCurrentArtifactId();
            setVisible(false);
            return;
          }

          resetCurrentArtifactId();
          setVisible(true);

          if (artifacts?.[artifact.id] == null) {
            setArtifacts(visibleArtifacts);
          }

          setTimeout(() => {
            setCurrentArtifactId(artifact.id);
          }, 15);
        };

        const buttonClass = cn(
          'relative overflow-hidden rounded-xl transition-all duration-300 hover:border-border-medium hover:bg-surface-hover hover:shadow-lg active:scale-[0.98]',
          {
            'border-border-medium bg-surface-hover shadow-lg': isSelected,
            'border-border-light bg-surface-tertiary shadow-sm': !isSelected,
          },
        );

        const actionLabel = isSelected
          ? localize('com_ui_click_to_close')
          : localize('com_ui_artifact_click');

        return (
          <button type="button" onClick={handleClick} className={buttonClass}>
            <div className="w-fit p-2">
              <div className="flex flex-row items-center gap-2">
                <FilePreview fileType={fileType} className="relative" />
                <div className="overflow-hidden text-left">
                  <div className="truncate font-medium">{artifact.title}</div>
                  <div className="truncate text-text-secondary">{actionLabel}</div>
                </div>
              </div>
            </div>
          </button>
        );
      })()}
      <br />
    </div>
  );
};

export default ArtifactButton;
