import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Eye, Code, User, Calendar, EarthIcon, ScrollText } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import type { TSkill } from 'librechat-data-provider';
import { useLocalize, useAuthContext, useSkillPermissions, useSkillActiveState } from '~/hooks';
import SkillMarkdownRenderer from './SkillMarkdownRenderer';
import { parseFrontmatter } from '../utils';
import DeleteSkill from '../dialogs/DeleteSkill';
import { ShareSkill } from '../buttons';
import { cn } from '~/utils';

interface SkillDetailProps {
  skill: TSkill;
  onEdit?: () => void;
  onDelete?: () => void;
}

const SKIP_KEYS = new Set(['name', 'description']);

function ViewToggle({
  viewMode,
  setViewMode,
  localize,
}: {
  viewMode: 'rendered' | 'source';
  setViewMode: (mode: 'rendered' | 'source') => void;
  localize: ReturnType<typeof useLocalize>;
}) {
  return (
    <div
      role="group"
      className="inline-flex h-7 rounded-lg bg-surface-tertiary p-0.5 text-sm font-medium"
    >
      <button
        type="button"
        onClick={() => setViewMode('rendered')}
        className={cn(
          'flex items-center justify-center rounded-md px-1.5 transition-colors',
          viewMode === 'rendered'
            ? 'bg-surface-primary text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary',
        )}
        aria-label={localize('com_ui_skill_view_rendered')}
        aria-pressed={viewMode === 'rendered'}
      >
        <Eye className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => setViewMode('source')}
        className={cn(
          'flex items-center justify-center rounded-md px-1.5 transition-colors',
          viewMode === 'source'
            ? 'bg-surface-primary text-text-primary shadow-sm'
            : 'text-text-secondary hover:text-text-primary',
        )}
        aria-label={localize('com_ui_skill_view_source')}
        aria-pressed={viewMode === 'source'}
      >
        <Code className="size-4" />
      </button>
    </div>
  );
}

export default function SkillDetail({ skill, onEdit, onDelete }: SkillDetailProps) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const permissions = useSkillPermissions(skill);
  const { isActive, toggle } = useSkillActiveState();
  const [viewMode, setViewMode] = useState<'rendered' | 'source'>('rendered');
  const skillEnabled = isActive(skill);

  const isPublic = skill.isPublic === true;
  const isShared = skill.author !== user?.id && Boolean(skill.authorName);
  const addedBy = isShared ? skill.authorName : localize('com_ui_you');
  const updatedDate = skill.updatedAt
    ? format(new Date(skill.updatedAt), 'MMM d, yyyy')
    : undefined;

  const { fields: frontmatterFields, body: cleanBody } = useMemo(
    () => parseFrontmatter(skill.body ?? '', SKIP_KEYS),
    [skill.body],
  );

  return (
    <article
      className="flex h-full min-w-0 flex-col gap-2 overflow-y-auto px-5 pb-5"
      aria-label={skill.name}
    >
      {/* Header row */}
      <div className="flex flex-col gap-3 pb-1 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-secondary">
              <ScrollText className="size-6 text-text-secondary" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-xl font-bold text-text-primary" title={skill.name}>
                  {skill.name}
                </h2>
                {isPublic && (
                  <TooltipAnchor
                    description={localize('com_ui_skill_sr_public')}
                    side="top"
                    render={
                      <EarthIcon
                        className="size-5 shrink-0 text-green-400"
                        aria-label={localize('com_ui_skill_sr_public')}
                      />
                    }
                  />
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                <span className="flex items-center gap-1">
                  <User className="size-3" aria-hidden="true" />
                  {addedBy}
                </span>
                {updatedDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" aria-hidden="true" />
                    {updatedDate}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={skillEnabled}
            aria-label={localize('com_ui_skill_toggle_active')}
            onClick={() => toggle(skill)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-surface-hover"
          >
            <span
              className={cn(
                'relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-200',
                skillEnabled ? 'bg-green-500' : 'bg-border-medium',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block size-3 rounded-full bg-white shadow-sm transition-transform duration-200',
                  skillEnabled ? 'translate-x-3.5' : 'translate-x-0.5',
                  'mt-0.5',
                )}
              />
            </span>
            <span className={skillEnabled ? 'text-text-primary' : 'text-text-tertiary'}>
              {localize(skillEnabled ? 'com_ui_skill_active' : 'com_ui_skill_inactive')}
            </span>
          </button>
          <ShareSkill skill={skill} />
          {permissions.canEdit && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border-medium px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-hover"
            >
              {localize('com_ui_edit')}
            </button>
          )}
          {permissions.canDelete && onDelete && (
            <DeleteSkill skillId={skill._id} skillName={skill.name} onDelete={onDelete} />
          )}
        </div>
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1">
        <h3 className="text-xs leading-4 text-text-secondary">{localize('com_ui_description')}</h3>
        <p className="whitespace-pre-wrap text-sm text-text-secondary">{skill.description}</p>
      </div>

      {/* Divider with view toggle */}
      <div className="flex items-center gap-3 py-1">
        <hr className="flex-1 border-border-medium" />
        <ViewToggle viewMode={viewMode} setViewMode={setViewMode} localize={localize} />
      </div>

      {/* Frontmatter metadata */}
      {viewMode === 'rendered' && frontmatterFields.length > 0 && (
        <div className="grid grid-cols-[max-content_1fr] items-baseline gap-x-8 gap-y-2 pb-2">
          {frontmatterFields.map(({ key, value }) => (
            <React.Fragment key={key}>
              <span className="text-xs text-text-secondary">{key}</span>
              <span className="text-sm text-text-primary">{value}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Content — fills remaining space, no card wrapper */}
      <div className="min-h-0 flex-1 overflow-auto">
        {viewMode === 'rendered' ? (
          <SkillMarkdownRenderer content={cleanBody} />
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text-primary">
            {skill.body ?? ''}
          </pre>
        )}
      </div>
    </article>
  );
}
