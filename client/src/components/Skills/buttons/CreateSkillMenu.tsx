import { useCallback, useMemo, useState } from 'react';
import { Plus, PenLine, Upload } from 'lucide-react';
import { Dropdown } from '@librechat/client';
import type { Option } from '~/common';
import { CreateSkillDialog, UploadSkillDialog } from '../dialogs';
import { useLocalize } from '~/hooks';

const WRITE = 'write';
const UPLOAD_SKILL = 'upload';

export default function CreateSkillMenu() {
  const localize = useLocalize();
  const [writeOpen, setWriteOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const options = useMemo<Option[]>(
    () => [
      {
        value: WRITE,
        label: localize('com_ui_skill_write_instructions'),
        icon: <PenLine className="size-4 text-text-primary" />,
      },
      {
        value: UPLOAD_SKILL,
        label: localize('com_ui_skill_upload'),
        icon: <Upload className="size-4 text-text-primary" />,
      },
    ],
    [localize],
  );

  const handleSelect = useCallback((value: string) => {
    if (value === WRITE) {
      setWriteOpen(true);
    } else if (value === UPLOAD_SKILL) {
      setUploadOpen(true);
    }
  }, []);

  return (
    <>
      <Dropdown
        value=""
        onChange={handleSelect}
        options={options}
        className="shrink-0 rounded-lg bg-transparent"
        icon={<Plus className="size-5" />}
        ariaLabel={localize('com_ui_create_skill')}
        iconOnly
      />
      <CreateSkillDialog isOpen={writeOpen} setIsOpen={setWriteOpen} />
      <UploadSkillDialog isOpen={uploadOpen} setIsOpen={setUploadOpen} />
    </>
  );
}
