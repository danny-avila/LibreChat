import React, { useState, useEffect, useMemo } from 'react';
import { Wand2 } from 'lucide-react';
import { Button, Input, useToastContext } from '@librechat/client';
import type { TMessage, TFile } from 'librechat-data-provider';
import { useSkillFilePreviewQuery, useCreateSkillFromFileMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

interface SaveSkillBannerProps {
  message: TMessage;
  hasCreateAccess: boolean;
}

const SKILL_MD_PATTERN = /^skill\.md$/i;

/** Pick the file most likely to be a generated skill: SKILL.md first, else first markdown. */
function pickCandidate(files: Partial<TFile>[] | undefined): Partial<TFile> | undefined {
  if (!files || files.length === 0) {
    return undefined;
  }
  const skillMd = files.find((f) => SKILL_MD_PATTERN.test(f.filename ?? ''));
  if (skillMd) {
    return skillMd;
  }
  return files.find(
    (f) => /\.md$/i.test(f.filename ?? '') || f.type === 'text/markdown',
  );
}

/**
 * Inline confirm banner shown beneath a completed assistant message when it
 * carries a generated skill file. Auto-detects the candidate, asks the backend
 * whether it is a skill, and offers a prefilled (editable) name with Save /
 * Dismiss actions. Renders nothing when there is no skill file or the user
 * lacks create access.
 */
export default function SaveSkillBanner({ message, hasCreateAccess }: SaveSkillBannerProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [dismissed, setDismissed] = useState(false);
  const [name, setName] = useState('');

  const candidate = useMemo(() => pickCandidate(message.files), [message.files]);
  const fileId = candidate?.file_id;

  const { data: preview } = useSkillFilePreviewQuery(fileId, {
    enabled: hasCreateAccess && !dismissed && !!fileId,
  });

  useEffect(() => {
    if (preview?.name) {
      setName(preview.name);
    }
  }, [preview?.name]);

  const createFromFile = useCreateSkillFromFileMutation({
    onSuccess: () => {
      showToast({ status: 'success', message: localize('com_ui_saved_as_skill') });
      setDismissed(true);
    },
    onError: (error: unknown) => {
      const apiMessage = (error as { response?: { data?: { error?: string } } })?.response?.data
        ?.error;
      showToast({ status: 'error', message: apiMessage ?? localize('com_ui_skill_create_error') });
    },
  });

  if (!hasCreateAccess || dismissed || !fileId || preview?.isSkill !== true) {
    return null;
  }

  const handleSave = () => {
    if (createFromFile.isLoading) {
      return;
    }
    createFromFile.mutate({ fileId, name: name.trim() });
  };

  return (
    <div
      role="region"
      aria-label={localize('com_ui_save_skill_banner_prompt')}
      className="my-2 flex flex-wrap items-center gap-2 rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-sm"
    >
      <Wand2 size="16" className="text-text-secondary" aria-hidden="true" />
      <span className="text-text-primary">{localize('com_ui_save_skill_banner_prompt')}</span>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={localize('com_ui_name')}
        className="h-8 w-44 flex-shrink-0"
      />
      <Button
        type="button"
        variant="default"
        size="sm"
        disabled={createFromFile.isLoading || name.trim().length === 0}
        onClick={handleSave}
      >
        {localize('com_ui_save')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={createFromFile.isLoading}
        onClick={() => setDismissed(true)}
      >
        {localize('com_ui_dismiss')}
      </Button>
    </div>
  );
}
