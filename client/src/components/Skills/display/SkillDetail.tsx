import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Eye, Code, User, Calendar, EarthIcon, ScrollText, FileText, Folder } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import type { TSkill, TSkillFile } from 'librechat-data-provider';
import { useLocalize, useAuthContext, useSkillPermissions } from '~/hooks';
import { useListSkillFilesQuery } from '~/data-provider';
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
 * Strip YAML frontmatter (`---\n...\n---`) from a SKILL.md body and return
 * the frontmatter fields as a key-value map + the remaining body.
 */
function parseFrontmatter(raw: string): {
  fields: Array<{ key: string; value: string }>;
  body: string;
} {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('---')) {
    return { fields: [], body: raw };
  }
  const after = trimmed.slice(3);
  const closingIdx = after.indexOf('\n---');
  if (closingIdx === -1) {
    return { fields: [], body: raw };
  }

  const block = after.slice(0, closingIdx);
  const body = after.slice(closingIdx + 4).trim();

  const fields: Array<{ key: string; value: string }> = [];
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) {
      continue;
    }
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    // Skip name/description — already shown in the header
    if (key.toLowerCase() === 'name' || key.toLowerCase() === 'description') {
      continue;
    }
    if (key && value) {
      fields.push({ key, value });
    }
  }

  return { fields, body };
}

/** Group flat TSkillFile list into a simple folder→files structure for display. */
function groupFiles(files: TSkillFile[]): Array<{ name: string; isFolder: boolean; path: string }> {
  const items: Array<{ name: string; isFolder: boolean; path: string }> = [];
  const folders = new Set<string>();

  // Always show SKILL.md first
  items.push({ name: 'SKILL.md', isFolder: false, path: 'SKILL.md' });

  const sorted = [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  for (const file of sorted) {
    const segments = file.relativePath.split('/');
    // Add top-level folder entries
    if (segments.length > 1) {
      const folder = segments[0];
      if (!folders.has(folder)) {
        folders.add(folder);
        items.push({ name: folder, isFolder: true, path: folder });
      }
    } else {
      // Root-level file (not SKILL.md — that's already added)
      items.push({ name: file.relativePath, isFolder: false, path: file.relativePath });
    }
  }

  return items;
}

export default function SkillDetail({ skill, onEdit, onDelete }: SkillDetailProps) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const permissions = useSkillPermissions(skill);
  const [viewMode, setViewMode] = useState<'rendered' | 'source'>('rendered');

  const filesQuery = useListSkillFilesQuery(skill._id, { enabled: skill.fileCount > 0 });
  const files = useMemo(() => filesQuery.data?.files ?? [], [filesQuery.data]);
  const hasFiles = files.length > 0;

  const isPublic = skill.isPublic === true;
  const isShared = skill.author !== user?.id && Boolean(skill.authorName);
  const addedBy = isShared ? skill.authorName : localize('com_ui_you');
  const updatedDate = skill.updatedAt
    ? format(new Date(skill.updatedAt), 'MMM d, yyyy')
    : undefined;

  // Parse frontmatter out of body for structured display
  const { fields: frontmatterFields, body: cleanBody } = useMemo(
    () => parseFrontmatter(skill.body ?? ''),
    [skill.body],
  );

  const fileList = useMemo(() => (hasFiles ? groupFiles(files) : []), [hasFiles, files]);

  return (
    <article
      className="flex h-full min-w-0 flex-col gap-2 overflow-y-auto px-6 pb-6"
      aria-label={skill.name}
    >
      {/* Header row — icon + name + actions */}
      <div className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:gap-4">
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

          {/* Frontmatter fields as structured metadata (like Claude.ai's Version/Triggers) */}
          {viewMode === 'rendered' && frontmatterFields.length > 0 && (
            <div className="mb-4 grid grid-cols-[max-content_1fr] items-baseline gap-x-8 gap-y-2">
              {frontmatterFields.map(({ key, value }) => (
                <React.Fragment key={key}>
                  <span className="text-xs text-text-secondary">{key}</span>
                  <span className="text-sm text-text-primary">{value}</span>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-auto">
            {viewMode === 'rendered' ? (
              <SkillMarkdownRenderer content={cleanBody} />
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text-primary">
                {skill.body ?? ''}
              </pre>
            )}
          </div>
        </div>
      </div>

      {/* File tree — shown when skill has additional files beyond SKILL.md */}
      {hasFiles && (
        <div className="mt-2 flex flex-col gap-1">
          <h3 className="text-xs text-text-secondary">{localize('com_ui_skill_files')}</h3>
          <div className="flex flex-col gap-0.5 rounded-xl border border-border-medium p-3">
            {fileList.map((item) => (
              <div
                key={item.path}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-text-secondary"
              >
                {item.isFolder ? (
                  <Folder className="size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className={cn('truncate', item.name === 'SKILL.md' && 'font-medium')}>
                  {item.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

// Need React for JSX Fragment
import React from 'react';
