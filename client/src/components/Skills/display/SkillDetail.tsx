import { useState } from 'react';
import { format } from 'date-fns';
import { Eye, Code, User, Calendar, EarthIcon, ScrollText } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import type { TSkill } from 'librechat-data-provider';
import { useLocalize, useAuthContext, useSkillPermissions } from '~/hooks';
import SkillMarkdownRenderer from './SkillMarkdownRenderer';
import DeleteSkill from '../dialogs/DeleteSkill';
import { ShareSkill } from '../buttons';
import { cn } from '~/utils';

interface SkillDetailProps {
  skill: TSkill;
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * Reader-first skill detail view. Header pattern matches the prompts
 * preview dialog: icon + name row, metadata below with icons, then
 * the content card.
 */
export default function SkillDetail({ skill, onEdit, onDelete }: SkillDetailProps) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const permissions = useSkillPermissions(skill);
  const [viewMode, setViewMode] = useState<'rendered' | 'source'>('rendered');

  const isPublic = skill.isPublic === true;
  const isShared = skill.author !== user?.id && Boolean(skill.authorName);
  const addedBy = isShared ? skill.authorName : localize('com_ui_you');
  const updatedDate = skill.updatedAt
    ? format(new Date(skill.updatedAt), 'MMM d, yyyy')
    : undefined;

  return (
    <article
      className="flex h-full min-w-0 flex-col gap-2 overflow-y-auto px-6 pb-6"
      aria-label={skill.name}
    >
      {/* Header row — icon + name + actions */}
      <div className="flex flex-col gap-3 pb-3 pt-4 sm:flex-row sm:items-center sm:gap-4">
        {/* Icon + text */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 items-center gap-3">
            {/* Skill icon — matches prompts category icon sizing */}
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
              {/* Metadata: author + date — inline with icons like prompts */}
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
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
        <div className="flex items-center gap-0.5">
          <h3 className="text-xs leading-4 text-text-secondary">
            {localize('com_ui_description')}
          </h3>
        </div>
        <p className="whitespace-pre-wrap text-sm text-text-secondary">{skill.description}</p>
      </div>

      {/* Divider */}
      <div className="flex h-8 items-center">
        <hr className="flex-1 border-border-medium" />
      </div>

      {/* Body card with source/rendered toggle */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border-medium bg-transparent p-5">
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Toggle row */}
          <div className="flex items-center justify-end pb-2">
            <div
              role="group"
              className="inline-flex h-8 rounded-lg bg-surface-tertiary p-0.5 text-sm font-medium"
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
                <Eye className="size-5" />
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
                <Code className="size-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-auto">
            {viewMode === 'rendered' ? (
              <SkillMarkdownRenderer content={skill.body ?? ''} />
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text-primary">
                {skill.body ?? ''}
              </pre>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
