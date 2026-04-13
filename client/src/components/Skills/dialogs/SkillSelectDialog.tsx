import { useState, useMemo, useCallback } from 'react';
import { Search, Check, EarthIcon, User, Plus, Star, ListFilter, X } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { OGDialog, OGDialogContent } from '@librechat/client';
import { PermissionTypes, Permissions, SystemCategories } from 'librechat-data-provider';
import type { TSkillSummary } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import {
  useLocalize,
  useAuthContext,
  useCategories,
  useHasAccess,
  useSkillFavorites,
} from '~/hooks';
import { useListSkillsQuery } from '~/data-provider';
import { CategoryIcon } from '~/components/Prompts';
import { cn } from '~/utils';

interface SkillSelectDialogProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

interface SkillCategory {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

const SKILL_MY = '__skill_filter_my__';
const SKILL_FAVORITES = '__skill_filter_favorites__';
const LIST_QUERY_OPTIONS = { limit: 100 } as const;

interface SidebarItemProps {
  value: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onSelect: (value: string) => void;
}

function SidebarItem({ value, label, icon, active, onSelect }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
        active
          ? 'bg-surface-active text-text-primary'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
      )}
      aria-pressed={active}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

interface SkillCardProps {
  skill: TSkillSummary;
  selected: boolean;
  isFavorite: boolean;
  isShared: boolean;
  isPublic: boolean;
  onToggle: (skillId: string) => void;
  onToggleFavorite: (skillId: string) => void;
  localize: ReturnType<typeof useLocalize>;
}

function SkillCard({
  skill,
  selected,
  isFavorite,
  isShared,
  isPublic,
  onToggle,
  onToggleFavorite,
  localize,
}: SkillCardProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(skill._id)}
      onMouseDown={(e) => e.preventDefault()}
      aria-pressed={selected}
      className={cn(
        'group relative flex h-32 cursor-pointer flex-col rounded-xl border p-3.5 text-left transition-all duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
        selected
          ? 'border-green-500/70 bg-green-500/[0.06]'
          : 'border-border-light hover:border-border-medium hover:bg-surface-tertiary',
      )}
    >
      <div className="flex w-full items-start gap-2">
        <p className="min-w-0 flex-1 truncate pr-1 text-sm font-semibold text-text-primary">
          {skill.name}
        </p>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(skill._id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite(skill._id);
            }
          }}
          className={cn(
            'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors',
            isFavorite
              ? 'text-yellow-500 hover:bg-yellow-500/10'
              : 'text-text-tertiary opacity-0 hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
          aria-label={isFavorite ? localize('com_ui_unfavorite') : localize('com_ui_favorite')}
          aria-pressed={isFavorite}
        >
          <Star className={cn('size-4', isFavorite && 'fill-current')} aria-hidden="true" />
        </span>
      </div>
      {skill.description && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-secondary">
          {skill.description}
        </p>
      )}
      <div className="mt-auto flex w-full items-center gap-1.5 pt-2">
        {skill.category && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-tertiary px-2 py-0.5 text-[10px] text-text-tertiary">
            <CategoryIcon category={skill.category} className="size-2.5" />
            {skill.category}
          </span>
        )}
        {isShared && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-surface-tertiary px-1.5 py-0.5 text-text-tertiary"
            title={skill.authorName}
            aria-label={skill.authorName}
          >
            <User className="size-2.5" aria-hidden="true" />
          </span>
        )}
        {isPublic && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-surface-tertiary px-1.5 py-0.5 text-text-tertiary"
            title={localize('com_ui_sr_public_skill')}
            aria-label={localize('com_ui_sr_public_skill')}
          >
            <EarthIcon className="size-2.5" aria-hidden="true" />
          </span>
        )}
        <span
          className={cn(
            'ml-auto flex size-5 shrink-0 items-center justify-center rounded-full transition-all duration-200',
            selected ? 'scale-100 bg-green-500 text-white opacity-100' : 'scale-75 opacity-0',
          )}
          aria-hidden="true"
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      </div>
    </button>
  );
}

function SkillSelectDialog({ isOpen, setIsOpen }: SkillSelectDialogProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { control, setValue } = useFormContext<AgentForm>();
  const [searchValue, setSearchValue] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>(SystemCategories.ALL);
  const { isFavorite: isFavoriteSkill, toggle: toggleFavoriteSkill } = useSkillFavorites();

  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.CREATE,
  });

  const { data: skillsData } = useListSkillsQuery(LIST_QUERY_OPTIONS);
  const { categories } = useCategories({ className: 'size-4', hasAccess: true });
  const typedCategories = categories as SkillCategory[] | undefined;

  const allSkills = useMemo(() => skillsData?.skills ?? [], [skillsData?.skills]);

  const watchedSkills = useWatch({ control, name: 'skills' });
  const selectedSet = useMemo(
    () => new Set<string>(Array.isArray(watchedSkills) ? watchedSkills : []),
    [watchedSkills],
  );

  const handleToggleSkill = useCallback(
    (skillId: string) => {
      const current = Array.isArray(watchedSkills) ? watchedSkills : [];
      if (current.includes(skillId)) {
        setValue(
          'skills',
          current.filter((id) => id !== skillId),
          { shouldDirty: true },
        );
      } else {
        setValue('skills', [...current, skillId], { shouldDirty: true });
      }
    },
    [watchedSkills, setValue],
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearchValue('');
    setActiveFilter(SystemCategories.ALL);
  }, [setIsOpen]);

  const handleCreate = useCallback(() => {
    setIsOpen(false);
    navigate('/skills/new');
  }, [navigate, setIsOpen]);

  const visibleSkills = useMemo(() => {
    const term = searchValue.toLowerCase();
    const result: TSkillSummary[] = [];
    for (const skill of allSkills) {
      if (activeFilter === SKILL_MY) {
        if (skill.author !== user?.id) continue;
      } else if (activeFilter === SKILL_FAVORITES) {
        if (!isFavoriteSkill(skill._id)) continue;
      } else if (activeFilter === SystemCategories.NO_CATEGORY) {
        if (skill.category) continue;
      } else if (activeFilter !== SystemCategories.ALL) {
        if (skill.category !== activeFilter) continue;
      }
      if (term && !skill.name.toLowerCase().includes(term)) continue;
      result.push(skill);
    }
    return result;
  }, [allSkills, activeFilter, searchValue, user?.id, isFavoriteSkill]);

  return (
    <OGDialog open={isOpen} onOpenChange={setIsOpen}>
      <OGDialogContent
        className="w-11/12 max-w-[1024px] overflow-hidden rounded-2xl border-border-medium p-0 shadow-xl md:max-h-[85vh]"
        showCloseButton={false}
      >
        <div className="flex h-[80vh] max-h-[720px]">
          <aside className="flex w-56 shrink-0 flex-col gap-1 border-r border-border-light bg-surface-primary-alt p-3">
            <h2 className="px-2.5 pb-1.5 pt-1 text-base font-bold text-text-primary">
              {localize('com_ui_add_skills')}
            </h2>
            {hasCreateAccess && (
              <button
                type="button"
                onClick={handleCreate}
                className="mb-1 flex w-full items-center justify-center gap-2 rounded-lg border border-border-light bg-transparent px-2.5 py-1.5 text-center text-sm text-text-primary transition-colors hover:border-border-medium hover:bg-surface-hover"
                aria-label={localize('com_ui_create_skill')}
              >
                <Plus className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{localize('com_ui_create_skill')}</span>
              </button>
            )}
            <SidebarItem
              value={SKILL_MY}
              label={localize('com_ui_my_skills')}
              icon={<User className="size-4 text-text-secondary" />}
              active={activeFilter === SKILL_MY}
              onSelect={setActiveFilter}
            />
            <SidebarItem
              value={SKILL_FAVORITES}
              label={localize('com_ui_favorites')}
              icon={<Star className="size-4 text-text-secondary" />}
              active={activeFilter === SKILL_FAVORITES}
              onSelect={setActiveFilter}
            />
            <div className="my-2 h-px bg-border-light" />
            <SidebarItem
              value={SystemCategories.ALL}
              label={localize('com_ui_all_proper')}
              icon={<ListFilter className="size-4 text-text-secondary" />}
              active={activeFilter === SystemCategories.ALL}
              onSelect={setActiveFilter}
            />
            {typedCategories?.map((category) => {
              if (!category.value) {
                return null;
              }
              return (
                <SidebarItem
                  key={category.value}
                  value={category.value}
                  label={category.label}
                  icon={category.icon ?? <ListFilter className="size-4 text-text-secondary" />}
                  active={activeFilter === category.value}
                  onSelect={setActiveFilter}
                />
              );
            })}
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 px-6 py-4">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder={localize('com_ui_search_skills')}
                  aria-label={localize('com_ui_search_skills')}
                  className="h-10 w-full rounded-xl border border-border-light bg-transparent pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
                />
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-light bg-transparent text-text-secondary transition-colors hover:border-border-medium hover:bg-surface-hover hover:text-text-primary"
                aria-label={localize('com_ui_close')}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div
              className="flex-1 overflow-y-auto p-4"
              role="group"
              aria-label={localize('com_ui_add_skills')}
            >
              {visibleSkills.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {visibleSkills.map((skill) => (
                    <SkillCard
                      key={skill._id}
                      skill={skill}
                      selected={selectedSet.has(skill._id)}
                      isFavorite={isFavoriteSkill(skill._id)}
                      isShared={skill.author !== user?.id && Boolean(skill.authorName)}
                      isPublic={skill.isPublic === true}
                      onToggle={handleToggleSkill}
                      onToggleFavorite={toggleFavoriteSkill}
                      localize={localize}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Search className="size-8 text-text-tertiary opacity-40" aria-hidden="true" />
                  <p className="mt-3 text-sm text-text-secondary">
                    {localize('com_ui_no_skills_found')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}

export default SkillSelectDialog;
