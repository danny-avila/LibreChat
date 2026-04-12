import { memo, useState, useMemo, useCallback } from 'react';
import { ScrollText, ChevronDown, FileText, Folder } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { TSkill } from 'librechat-data-provider';
import { useListSkillFilesQuery } from '~/data-provider';
import { cn } from '~/utils';

interface SkillListItemProps {
  skill: TSkill;
  isActive: boolean;
}

/**
 * Skill list item with inline expandable file tree for multi-file skills.
 * Matches Claude.ai's pattern: icon badge + name + chevron toggle.
 * Clicking the chevron expands SKILL.md + additional files inline.
 */
function SkillListItem({ skill, isActive }: SkillListItemProps) {
  const navigate = useNavigate();
  const hasFiles = skill.fileCount > 0;
  const [expanded, setExpanded] = useState(false);

  // Only fetch files when expanded
  const filesQuery = useListSkillFilesQuery(skill._id, {
    enabled: expanded && hasFiles,
  });
  const files = useMemo(() => filesQuery.data?.files ?? [], [filesQuery.data]);

  const handleSkillClick = useCallback(() => {
    navigate(`/skills/${skill._id}`);
  }, [navigate, skill._id]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  }, []);

  const handleFileClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigate(`/skills/${skill._id}`);
    },
    [navigate, skill._id],
  );

  // Group files into folders + root files for display
  const fileTree = useMemo(() => {
    const items: Array<{ name: string; isFolder: boolean; path: string }> = [];
    const seenFolders = new Set<string>();

    // SKILL.md is always first
    items.push({ name: 'SKILL.md', isFolder: false, path: 'SKILL.md' });

    const sorted = [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    for (const file of sorted) {
      const segments = file.relativePath.split('/');
      if (segments.length > 1) {
        const folder = segments[0];
        if (!seenFolders.has(folder)) {
          seenFolders.add(folder);
          items.push({ name: folder, isFolder: true, path: folder });
        }
      } else {
        items.push({ name: file.relativePath, isFolder: false, path: file.relativePath });
      }
    }
    return items;
  }, [files]);

  return (
    <div className="flex flex-col gap-px">
      {/* Skill row */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleSkillClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSkillClick();
          }
        }}
        className={cn(
          'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm transition-colors',
          isActive
            ? 'bg-surface-active text-text-primary'
            : 'text-text-primary hover:bg-surface-hover',
        )}
        aria-current={isActive ? 'true' : undefined}
      >
        {/* Icon badge */}
        <span className="flex size-6 shrink-0 items-center justify-center">
          <span className="flex size-6 items-center justify-center rounded-md border border-border-light bg-surface-primary shadow-sm">
            <ScrollText className="size-3.5 text-text-secondary" aria-hidden="true" />
          </span>
        </span>

        {/* Name */}
        <span className="min-w-0 flex-1">
          <span className={cn('truncate', isActive && 'font-semibold')}>{skill.name}</span>
        </span>

        {/* Chevron toggle for multi-file skills */}
        {hasFiles && (
          <button
            type="button"
            onClick={handleToggle}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:text-text-primary"
            aria-expanded={expanded}
            aria-label="Toggle file list"
          >
            <ChevronDown
              className={cn(
                'size-3.5 transition-transform duration-200',
                expanded ? 'rotate-0' : '-rotate-90',
              )}
            />
          </button>
        )}
      </div>

      {/* Inline file tree — expands below the skill name */}
      {expanded && hasFiles && (
        <div
          className={cn(
            'ml-10 overflow-hidden transition-all duration-200 ease-in-out',
            expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0',
          )}
        >
          <div className="flex flex-col gap-0.5">
            {fileTree.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={handleFileClick}
                className="w-full rounded-lg py-1 text-left text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                style={{ paddingLeft: item.isFolder ? '8px' : '12px' }}
              >
                <span className="flex items-center gap-1.5">
                  {item.isFolder ? (
                    <Folder className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <FileText className="size-3.5 shrink-0 opacity-0" aria-hidden="true" />
                  )}
                  <span className="truncate">{item.name}</span>
                  {item.isFolder && (
                    <ChevronDown className="ml-auto size-3.5 shrink-0 -rotate-90 text-text-secondary" />
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(SkillListItem);
