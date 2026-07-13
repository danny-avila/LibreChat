import { useMemo, useState, useCallback } from 'react';
import { Plus, Search } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import {
  Radio,
  Input,
  Button,
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  OGDialogDescription,
} from '@librechat/client';
import type { TSkill } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks/useLocalize';
import type { CategoryOption } from './CategoryFilter';
import type { AgentItem } from './items/types';
import type { AgentForm } from '~/common';
import { useLocalize, useHasAccess, useAuthContext, useToolFavorites } from '~/hooks';
import { CreateSkillDialog } from '~/components/Skills/dialogs';
import { skillsEnabledTransition } from './items/mutations';
import MarketplaceCatalog from './MarketplaceCatalog';
import { useListSkillsQuery } from '~/data-provider';
import { CategoryIcon } from '~/components/Prompts';
import { buildSkillItems } from './items/catalog';
import ItemDialog from './ItemDialog/ItemDialog';
import { applyFilter } from './items/filtering';
import CategoryFilter from './CategoryFilter';
import { itemKey } from './items/selectors';

interface SkillsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
}

type SkillView = 'marketplace' | 'mine' | 'favorites';

const VIEWS: Array<{ value: SkillView; labelKey: TranslationKeys }> = [
  { value: 'marketplace', labelKey: 'com_ui_all_proper' },
  { value: 'mine', labelKey: 'com_ui_tools_view_made_by_you' },
  { value: 'favorites', labelKey: 'com_ui_tools_view_favorites' },
];

export default function SkillsDialog({ open, onOpenChange, agentId }: SkillsDialogProps) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { control, getValues, setValue } = useFormContext<AgentForm>();

  const hasSkillsAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });
  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.CREATE,
  });
  const { data: skillsData, isLoading: isLoadingSkills } = useListSkillsQuery(
    { limit: 100 },
    { enabled: hasSkillsAccess },
  );
  const { favoriteKeys, toggle: toggleFavorite } = useToolFavorites();

  const skillsField = useWatch({ control, name: 'skills' });
  const selectedIds = useMemo(
    () => new Set(((skillsField ?? []) as string[]).map((id) => itemKey({ kind: 'skill', id }))),
    [skillsField],
  );

  const [view, setView] = useState<SkillView>('marketplace');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | 'all'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<AgentItem | null>(null);

  const catalog = useMemo(
    () => buildSkillItems(skillsData?.skills ?? [], user?.id),
    [skillsData, user?.id],
  );

  const categoryOptions = useMemo<CategoryOption[]>(() => {
    const seen = new Set<string>();
    const options: CategoryOption[] = [];
    for (const item of catalog) {
      if (item.kind !== 'skill') {
        continue;
      }
      const value = item.skill.category;
      if (!value || seen.has(value)) {
        continue;
      }
      seen.add(value);
      options.push({
        value,
        label: value,
        icon: <CategoryIcon category={value} className="size-4" />,
      });
    }
    return options;
  }, [catalog]);

  const filtered = useMemo(
    () =>
      applyFilter(
        catalog,
        { search, kind: 'skill', category, view },
        { favoritedIds: favoriteKeys },
      ),
    [catalog, search, category, view, favoriteKeys],
  );

  const applySkillsSelection = useCallback(
    (next: string[]) => {
      setValue('skills', next, { shouldDirty: true });
      const flag = skillsEnabledTransition(next, getValues('skills_enabled'));
      if (flag !== undefined) {
        setValue('skills_enabled', flag, { shouldDirty: true });
      }
    },
    [getValues, setValue],
  );

  const handleSkillCreated = useCallback(
    (skill: TSkill) => {
      const current = (getValues('skills') ?? []) as string[];
      applySkillsSelection(Array.from(new Set([...current, skill._id])));
      setView('mine');
    },
    [getValues, applySkillsSelection],
  );

  const handleToggle = useCallback(
    (item: AgentItem) => {
      const current = (getValues('skills') ?? []) as string[];
      if (selectedIds.has(itemKey(item))) {
        applySkillsSelection(current.filter((id) => id !== item.id));
        return;
      }
      applySkillsSelection(Array.from(new Set([...current, item.id])));
    },
    [getValues, applySkillsSelection, selectedIds],
  );

  const viewOptions = useMemo(
    () => VIEWS.map((option) => ({ value: option.value, label: localize(option.labelKey) })),
    [localize],
  );

  const emptyKey: TranslationKeys | undefined =
    !search.trim() && category === 'all' && view === 'marketplace'
      ? 'com_ui_no_skills_found'
      : undefined;

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-11/12 max-w-[900px] overflow-hidden rounded-2xl border-border-medium p-0 shadow-xl md:max-h-[92vh]">
        <OGDialogDescription className="sr-only">
          {localize('com_ui_skills_dialog_description')}
        </OGDialogDescription>
        <div className="flex h-[80vh] max-h-[760px] flex-col">
          <div className="flex flex-col gap-3 border-b border-border-light px-6 pb-4 pt-5">
            <div className="flex items-center gap-2 pr-10">
              <OGDialogTitle className="text-base font-semibold text-text-primary">
                {localize('com_ui_skills')}
              </OGDialogTitle>
            </div>

            <div className="flex items-center gap-2">
              {hasCreateAccess && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  aria-label={localize('com_ui_create_skill')}
                  className="h-[42px] w-[42px] shrink-0 p-0"
                >
                  <Plus className="size-4" aria-hidden="true" />
                </Button>
              )}
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 z-[1] size-4 -translate-y-1/2 text-text-tertiary"
                  aria-hidden="true"
                />
                <Input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={localize('com_ui_search_skills')}
                  aria-label={localize('com_ui_search_skills')}
                  className="h-[42px] bg-transparent pl-9"
                />
              </div>
              <CategoryFilter options={categoryOptions} value={category} onChange={setCategory} />
              <label id="skills-view-label" className="sr-only">
                {localize('com_ui_skills_filter')}
              </label>
              <Radio
                options={viewOptions}
                value={view}
                onChange={(value) => {
                  setView(value as SkillView);
                  setCategory('all');
                }}
                className="flex-shrink-0 p-1"
                aria-labelledby="skills-view-label"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <MarketplaceCatalog
              items={filtered}
              selectedIds={selectedIds}
              onToggle={handleToggle}
              onConfigure={setDetailItem}
              view={view}
              isLoadingSkills={isLoadingSkills}
              skillsInView={view !== 'mine'}
              favoriteKeys={favoriteKeys}
              onToggleFavorite={toggleFavorite}
              emptyKey={emptyKey}
              ariaLabel={localize('com_ui_skills')}
            />
          </div>
        </div>
        <ItemDialog item={detailItem} agentId={agentId} onClose={() => setDetailItem(null)} />
        <CreateSkillDialog
          isOpen={createOpen}
          setIsOpen={setCreateOpen}
          onCreated={handleSkillCreated}
        />
      </OGDialogContent>
    </OGDialog>
  );
}
