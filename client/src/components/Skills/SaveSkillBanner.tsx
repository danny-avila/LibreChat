import React, { useState, useMemo } from 'react';
import { Wand2 } from 'lucide-react';
import { parseTextParts } from 'librechat-data-provider';
import { Button, Input, useToastContext } from '@librechat/client';
import type { TMessage } from 'librechat-data-provider';
import { useCreateSkillFromContentMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

interface SaveSkillBannerProps {
  message: TMessage;
  hasCreateAccess: boolean;
}

export interface ParsedSkillArtifact {
  name: string;
  description: string;
  content: string;
}

const ARTIFACT_PATTERN = /:::artifact\{([^}]*)\}\s*\n([\s\S]*?)\n:::/;
const ATTR_PATTERN = (key: string): RegExp => new RegExp(`${key}="([^"]*)"`);

/** Kebab-case an identifier: lowercase, non-`[a-z0-9-]` → `-`, collapse, trim. */
function kebab(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Strip the trailing `SKILL.md` (and surrounding separators/dashes) from a title. */
function cleanTitle(title: string): string {
  return title
    .replace(/skill\.md/gi, '')
    .replace(/[-–—:|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First non-heading, non-empty line of the skill body — a description fallback. */
function firstBodyLine(content: string): string {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed.startsWith('```')) {
      continue;
    }
    return trimmed;
  }
  return '';
}

/**
 * Parse the FIRST LibreChat artifact out of an assistant message's text and,
 * when it is a skill (markdown type + a `skill`-flavored identifier/title),
 * return the data needed to prefill the save banner. Returns `null` otherwise.
 *
 * The artifact terminator is a lone `:::` line, which lets the body carry nested
 * ` ``` ` fences (e.g. a `python` block) without confusing the matcher. The
 * outer fence wrapper is stripped so `content` is the raw SKILL.md markdown.
 *
 * Exported for unit testing.
 */
export function parseSkillArtifact(text: string): ParsedSkillArtifact | null {
  const match = ARTIFACT_PATTERN.exec(text);
  if (!match) {
    return null;
  }

  const attrs = match[1];
  const identifier = ATTR_PATTERN('identifier').exec(attrs)?.[1] ?? '';
  const type = ATTR_PATTERN('type').exec(attrs)?.[1] ?? '';
  const title = ATTR_PATTERN('title').exec(attrs)?.[1] ?? '';

  const isMarkdown = type === 'text/markdown' || /markdown/i.test(type);
  const looksLikeSkill = /skill/i.test(identifier) || /skill/i.test(title);
  if (!isMarkdown || !looksLikeSkill) {
    return null;
  }

  const content = match[2].replace(/^```[\w-]*\n/, '').replace(/\n```\s*$/, '');

  const name = kebab(identifier) || kebab(title);
  const description = cleanTitle(title) || firstBodyLine(content);

  return { name, description, content };
}

/** Concatenate an assistant message's text parts, falling back to `message.text`. */
function getMessageText(message: TMessage): string {
  if (message.content && message.content.length > 0) {
    return parseTextParts(message.content);
  }
  return message.text ?? '';
}

/**
 * Inline confirm banner shown beneath a completed assistant message when it
 * emits a SKILL.md as a LibreChat artifact. Parses the artifact out of the
 * message content, offers a prefilled (editable) name with Save / Dismiss
 * actions. Renders nothing when there is no skill artifact or the user lacks
 * create access.
 */
export default function SaveSkillBanner({ message, hasCreateAccess }: SaveSkillBannerProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [dismissed, setDismissed] = useState(false);

  const parsed = useMemo(() => parseSkillArtifact(getMessageText(message)), [
    message.content,
    message.text,
  ]);

  const [name, setName] = useState(parsed?.name ?? '');
  const [nameTouched, setNameTouched] = useState(false);
  const editedName = nameTouched ? name : parsed?.name ?? '';

  const createFromContent = useCreateSkillFromContentMutation({
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

  if (!hasCreateAccess || dismissed || !parsed) {
    return null;
  }

  const handleSave = () => {
    if (createFromContent.isLoading) {
      return;
    }
    createFromContent.mutate({
      content: parsed.content,
      name: editedName.trim(),
      description: parsed.description,
    });
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
        value={editedName}
        onChange={(e) => {
          setNameTouched(true);
          setName(e.target.value);
        }}
        aria-label={localize('com_ui_name')}
        className="h-8 w-44 flex-shrink-0"
      />
      <Button
        type="button"
        variant="default"
        size="sm"
        disabled={createFromContent.isLoading || editedName.trim().length === 0}
        onClick={handleSave}
      >
        {localize('com_ui_save')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={createFromContent.isLoading}
        onClick={() => setDismissed(true)}
      >
        {localize('com_ui_dismiss')}
      </Button>
    </div>
  );
}
