import { useState } from 'react';
import { format } from 'date-fns';
import { Eye, Code, EarthIcon } from 'lucide-react';
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
 * Reader-first skill detail view matching Claude.ai's layout:
 * name header → metadata row → description → divider → rendered body card
 * with source/rendered toggle. No form fields, no save/cancel.
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
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-6 pb-6">
      {/* Header: name + actions */}
      <div className="flex items-start justify-between pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-xl font-bold text-text-primary">{skill.name}</h2>
            {isPublic && (
              <TooltipAnchor
                description={localize('com_ui_skill_sr_public')}
                side="top"
                render={
                  <EarthIcon
                    className="size-5 shrink-0 text-green-500"
                    aria-label={localize('com_ui_skill_sr_public')}
                  />
                }
              />
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ShareSkill skill={skill} />
          {permissions.canEdit && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex size-9 items-center justify-center rounded-md border border-border-medium text-xs font-semibold text-text-primary transition-colors hover:bg-surface-hover"
            >
              {localize('com_ui_edit')}
            </button>
          )}
          {permissions.canDelete && onDelete && (
            <DeleteSkill skillId={skill._id} skillName={skill.name} onDelete={onDelete} />
          )}
        </div>
      </div>

      {/* Metadata row */}
      <div className="flex gap-8">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-text-secondary">{localize('com_ui_skill_added_by')}</span>
          <span className="text-sm text-text-primary">{addedBy}</span>
        </div>
        {updatedDate && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-text-secondary">
              {localize('com_ui_skill_last_updated')}
            </span>
            <span className="text-sm text-text-primary">{updatedDate}</span>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1">
        <h3 className="text-xs text-text-secondary">{localize('com_ui_description')}</h3>
        <p className="whitespace-pre-wrap text-sm text-text-secondary">{skill.description}</p>
      </div>

      {/* Divider */}
      <hr className="border-border-medium" />

      {/* Body card with source/rendered toggle */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border-medium bg-surface-primary-alt p-5">
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
                    : 'text-text-tertiary hover:text-text-secondary',
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
                    : 'text-text-tertiary hover:text-text-secondary',
                )}
                aria-label={localize('com_ui_skill_view_source')}
                aria-pressed={viewMode === 'source'}
              >
                <Code className="size-4" />
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
    </div>
  );
}
