import { useSetRecoilState } from 'recoil';
import type { Artifact } from '~/common';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { useLocalize } from '~/hooks';
import { getFileType } from '~/utils';
import store from '~/store';

const ArtifactButton = ({ artifact }: { artifact: Artifact | null }) => {
  const localize = useLocalize();
  const setVisible = useSetRecoilState(store.artifactsVisible);
  const setArtifactId = useSetRecoilState(store.currentArtifactId);
  if (artifact === null || artifact === undefined) {
    return null;
  }
  const fileType = getFileType('artifact');

  return (
    <div className="group relative my-4 rounded-xl text-sm text-text-primary">
      <button
        type="button"
        onClick={() => {
          setArtifactId(artifact.id);
          setVisible(true);
        }}
        className="relative overflow-hidden rounded-xl border border-border-medium transition-all duration-300 hover:border-border-xheavy hover:shadow-lg"
      >
        <div className="w-60 bg-surface-tertiary p-2 ">
          <div className="flex flex-row items-center gap-2">
            <FilePreview fileType={fileType} className="relative" />
            <div className="overflow-hidden text-left">
              <div className="truncate font-medium">{artifact.title}</div>
              <div className="truncate text-text-secondary">
                {localize('com_ui_artifact_click')}
              </div>
            </div>
          </div>
        </div>
      </button>
      <br />
    </div>
  );
};

export default ArtifactButton;
