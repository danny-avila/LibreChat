import { useRef, useCallback, useMemo } from 'react';
import { Plus, PenLine, Upload, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, useToastContext } from '@librechat/client';
import type { ParsedSkillMd } from '../utils/parseSkillMd';
import type { Option } from '~/common';
import { parseSkillMd } from '../utils/parseSkillMd';
import { useLocalize } from '~/hooks';

const CREATE_AI = 'ai';
const CREATE_MANUAL = 'manual';
const CREATE_UPLOAD = 'upload';

export default function CreateSkillMenu() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          return;
        }
        const parsed: ParsedSkillMd = parseSkillMd(text);
        navigate('/skills/new', { state: { uploadData: parsed } });
      };
      reader.onerror = () => {
        showToast({
          status: 'error',
          message: localize('com_ui_create_skill_upload_error'),
        });
      };
      reader.readAsText(file);

      event.target.value = '';
    },
    [navigate, showToast, localize],
  );

  const options = useMemo<Option[]>(
    () => [
      {
        value: CREATE_AI,
        label: localize('com_ui_create_skill_ai'),
        icon: <Sparkles className="size-4 text-text-primary" />,
        disabled: true,
      },
      {
        value: CREATE_MANUAL,
        label: localize('com_ui_create_skill_manual'),
        icon: <PenLine className="size-4 text-text-primary" />,
      },
      {
        value: CREATE_UPLOAD,
        label: localize('com_ui_create_skill_upload'),
        icon: <Upload className="size-4 text-text-primary" />,
      },
    ],
    [localize],
  );

  const handleSelect = useCallback(
    (value: string) => {
      if (value === CREATE_MANUAL) {
        navigate('/skills/new');
      } else if (value === CREATE_UPLOAD) {
        setTimeout(() => fileInputRef.current?.click(), 0);
      }
    },
    [navigate],
  );

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
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt"
        className="hidden"
        aria-hidden="true"
        onChange={handleFileChange}
      />
    </>
  );
}
