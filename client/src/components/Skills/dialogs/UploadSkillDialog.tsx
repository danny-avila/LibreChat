import { useRef, useCallback, useState } from 'react';
import { Upload } from 'lucide-react';
import JSZip from 'jszip';
import { useNavigate } from 'react-router-dom';
import { OGDialog, OGDialogContent, Spinner, useToastContext } from '@librechat/client';
import { useCreateSkillMutation } from '~/data-provider';
import { parseSkillMd } from '../utils/parseSkillMd';
import { useLocalize } from '~/hooks';

interface UploadSkillDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

/** Hard limits to guard against zip bombs and abuse. */
const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50 MB compressed
const MAX_ENTRIES = 500;

/**
 * Upload skill dialog. Accepts:
 * - `.md` — reads as text, parses YAML frontmatter, creates skill
 * - `.zip` / `.skill` — extracts with JSZip, finds SKILL.md, creates
 *   skill from its content. Validates zip safety limits.
 */
export default function UploadSkillDialog({ isOpen, setIsOpen }: UploadSkillDialogProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const createSkill = useCreateSkillMutation({
    onSuccess: (skill) => {
      showToast({ status: 'success', message: localize('com_ui_skill_created') });
      setIsOpen(false);
      setIsProcessing(false);
      navigate(`/skills/${skill._id}`);
    },
    onError: (error: unknown) => {
      setIsProcessing(false);
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        localize('com_ui_skill_create_error');
      showToast({ status: 'error', message });
    },
  });

  const createFromMarkdown = useCallback(
    (text: string, filename: string) => {
      const parsed = parseSkillMd(text);
      const name =
        parsed.name ||
        filename
          .replace(/\.md$/i, '')
          .replace(/[^a-z0-9-]/gi, '-')
          .toLowerCase();
      if (!name) {
        showToast({ status: 'error', message: localize('com_ui_skill_name_required') });
        setIsProcessing(false);
        return;
      }
      createSkill.mutate({
        name,
        description: parsed.description || name,
        body: text,
      });
    },
    [createSkill, showToast, localize],
  );

  const processZip = useCallback(
    async (arrayBuffer: ArrayBuffer, filename: string) => {
      try {
        if (arrayBuffer.byteLength > MAX_ZIP_SIZE) {
          showToast({
            status: 'error',
            message: `File too large (max ${MAX_ZIP_SIZE / 1024 / 1024}MB)`,
          });
          setIsProcessing(false);
          return;
        }

        const zip = await JSZip.loadAsync(arrayBuffer);
        const entries = Object.keys(zip.files);

        if (entries.length > MAX_ENTRIES) {
          showToast({ status: 'error', message: `Too many files in archive (max ${MAX_ENTRIES})` });
          setIsProcessing(false);
          return;
        }

        // Find SKILL.md — could be at root or inside a single top-level folder
        let skillMdPath: string | null = null;
        for (const path of entries) {
          const normalized = path.replace(/\\/g, '/');
          // Reject path traversal
          if (normalized.includes('..') || normalized.startsWith('/')) {
            continue;
          }
          const segments = normalized.split('/').filter(Boolean);
          const basename = segments[segments.length - 1];
          if (basename?.toUpperCase() === 'SKILL.MD' && segments.length <= 2) {
            skillMdPath = path;
            break;
          }
        }

        if (!skillMdPath) {
          showToast({
            status: 'error',
            message: localize('com_ui_skill_upload_req_zip'),
          });
          setIsProcessing(false);
          return;
        }

        const skillMdContent = await zip.file(skillMdPath)?.async('string');
        if (!skillMdContent) {
          showToast({ status: 'error', message: localize('com_ui_create_skill_upload_error') });
          setIsProcessing(false);
          return;
        }

        const inferredName = filename
          .replace(/\.(zip|skill)$/i, '')
          .replace(/[^a-z0-9-]/gi, '-')
          .toLowerCase();
        createFromMarkdown(skillMdContent, inferredName);
      } catch {
        showToast({ status: 'error', message: localize('com_ui_create_skill_upload_error') });
        setIsProcessing(false);
      }
    },
    [createFromMarkdown, showToast, localize],
  );

  const handleFile = useCallback(
    (file: File) => {
      if (isProcessing || createSkill.isLoading) {
        return;
      }
      setIsProcessing(true);

      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'md') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result;
          if (typeof text !== 'string') {
            showToast({ status: 'error', message: localize('com_ui_create_skill_upload_error') });
            setIsProcessing(false);
            return;
          }
          createFromMarkdown(text, file.name);
        };
        reader.onerror = () => {
          showToast({ status: 'error', message: localize('com_ui_create_skill_upload_error') });
          setIsProcessing(false);
        };
        reader.readAsText(file);
        return;
      }

      if (ext === 'zip' || ext === 'skill') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const buffer = e.target?.result;
          if (!(buffer instanceof ArrayBuffer)) {
            showToast({ status: 'error', message: localize('com_ui_create_skill_upload_error') });
            setIsProcessing(false);
            return;
          }
          processZip(buffer, file.name);
        };
        reader.onerror = () => {
          showToast({ status: 'error', message: localize('com_ui_create_skill_upload_error') });
          setIsProcessing(false);
        };
        reader.readAsArrayBuffer(file);
        return;
      }

      showToast({ status: 'error', message: localize('com_ui_create_skill_upload_error') });
      setIsProcessing(false);
    },
    [isProcessing, createSkill.isLoading, createFromMarkdown, processZip, showToast, localize],
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
              disabled={isProcessing}
              className={`flex h-[120px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-text-secondary transition-colors ${
                isDragging
                  ? 'border-border-heavy bg-surface-hover'
                  : 'border-border-medium hover:bg-surface-hover'
              } ${isProcessing ? 'cursor-wait opacity-50' : ''}`}
            >
              {isProcessing ? (
                <Spinner className="size-8" />
              ) : (
                <Upload className="size-8 text-text-secondary" aria-hidden="true" />
              )}
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
            onChange={handleFileInput}
          />
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
