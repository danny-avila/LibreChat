import { useRef, useCallback, useState } from 'react';
import { Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OGDialog, OGDialogContent, useToastContext } from '@librechat/client';
import { useCreateSkillMutation } from '~/data-provider';
import { parseSkillMd } from '../utils/parseSkillMd';
import { useLocalize } from '~/hooks';

interface UploadSkillDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

/**
 * Upload skill dialog matching Claude.ai's "Upload skill" modal.
 * Accepts .md, .zip, or .skill files. Phase 1 only processes .md
 * files (extracts frontmatter → creates skill). Zip/multi-file
 * support is phase 2.
 */
export default function UploadSkillDialog({ isOpen, setIsOpen }: UploadSkillDialogProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const createSkill = useCreateSkillMutation({
    onSuccess: (skill) => {
      showToast({ status: 'success', message: localize('com_ui_skill_created') });
      setIsOpen(false);
      navigate(`/skills/${skill._id}`);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        localize('com_ui_skill_create_error');
      showToast({ status: 'error', message });
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          return;
        }
        const parsed = parseSkillMd(text);
        if (!parsed.name) {
          showToast({
            status: 'error',
            message: localize('com_ui_create_skill_upload_error'),
          });
          return;
        }
        createSkill.mutate({
          name: parsed.name,
          description: parsed.description || parsed.name,
          body: text,
        });
      };
      reader.onerror = () => {
        showToast({
          status: 'error',
          message: localize('com_ui_create_skill_upload_error'),
        });
      };
      reader.readAsText(file);
    },
    [createSkill, showToast, localize],
  );

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFile(file);
      }
      event.target.value = '';
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  return (
    <OGDialog open={isOpen} onOpenChange={setIsOpen}>
      <OGDialogContent className="w-11/12 max-w-lg overflow-hidden">
        <div className="flex flex-col gap-6 p-1 sm:p-2">
          <h2 className="text-lg font-bold text-text-primary">
            {localize('com_ui_skill_upload_title')}
          </h2>

          <div className="flex flex-col gap-3">
            {/* Drop zone */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex h-[120px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-text-secondary transition-colors ${
                isDragging
                  ? 'border-border-heavy bg-surface-hover'
                  : 'border-border-medium hover:bg-surface-hover'
              }`}
              disabled={createSkill.isLoading}
            >
              <Upload className="size-8 text-text-secondary" aria-hidden="true" />
              {localize('com_ui_skill_upload_drag')}
            </button>

            {/* Requirements */}
            <div className="flex flex-col gap-3 text-xs text-text-secondary">
              <div>
                <p className="font-medium">{localize('com_ui_skill_upload_requirements')}</p>
                <ul className="mt-1 list-inside list-disc">
                  <li>{localize('com_ui_skill_upload_req_md')}</li>
                  <li>{localize('com_ui_skill_upload_req_zip')}</li>
                </ul>
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,.skill,.md"
            className="hidden"
            multiple
            onChange={handleFileInput}
          />
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
