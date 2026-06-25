import { useMemo, useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  Radio,
  Input,
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  OGDialogDescription,
} from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { AgentItem } from './items/types';
import type { TranslationKeys } from '~/hooks/useLocalize';
import type { AgentForm } from '~/common';
import {
  useListSkillsQuery,
  useGetFavoritesQuery,
  useGetSkillFavoritesQuery,
} from '~/data-provider';
import { useLocalize, useHasAccess, useAuthContext } from '~/hooks';
import MarketplaceCatalog from './MarketplaceCatalog';
import ItemDialog from './ItemDialog/ItemDialog';
import { buildSkillItems } from './items/catalog';
import { applyFilter } from './items/filtering';
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
  const { data: skillsData, isLoading: isLoadingSkills } = useListSkillsQuery(
    { limit: 100 },
    { enabled: hasSkillsAccess },
  );
  const { data: favorites } = useGetFavoritesQuery();
  const { data: skillFavorites } = useGetSkillFavoritesQuery();

  const favoritedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const favorite of favorites ?? []) {
      if (favorite.skillId != null) {
        ids.add(favorite.skillId);
      }
    }
    for (const skillId of skillFavorites ?? []) {
      ids.add(skillId);
    }
    return ids;
  }, [favorites, skillFavorites]);

  const skillsField = useWatch({ control, name: 'skills' });
  const selectedIds = useMemo(
    () => new Set(((skillsField ?? []) as string[]).map((id) => itemKey({ kind: 'skill', id }))),
    [skillsField],
  );

  const [view, setView] = useState<SkillView>('marketplace');
  const [search, setSearch] = useState('');
  const [detailItem, setDetailItem] = useState<AgentItem | null>(null);

  const catalog = useMemo(
    () => buildSkillItems(skillsData?.skills ?? [], user?.id),
    [skillsData, user?.id],
  );

  const filtered = useMemo(
    () => applyFilter(catalog, { search, kind: 'skill', category: 'all', view }, { favoritedIds }),
    [catalog, search, view, favoritedIds],
  );

  const handleToggle = useCallback(
    (item: AgentItem) => {
      const current = (getValues('skills') ?? []) as string[];
      if (selectedIds.has(itemKey(item))) {
        setValue(
          'skills',
          current.filter((id) => id !== item.id),
          { shouldDirty: true },
        );
        return;
      }
      setValue('skills', Array.from(new Set([...current, item.id])), { shouldDirty: true });
    },
    [getValues, setValue, selectedIds],
  );

  const viewOptions = useMemo(
    () => VIEWS.map((option) => ({ value: option.value, label: localize(option.labelKey) })),
    [localize],
  );

  const emptyKey: TranslationKeys | undefined =
    !search.trim() && view === 'marketplace' ? 'com_ui_no_skills_found' : undefined;

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-11/12 max-w-[900px] overflow-hidden rounded-2xl border-border-medium p-0 shadow-xl md:max-h-[92vh]">
        <OGDialogDescription className="sr-only">
          {localize('com_ui_skills_dialog_description')}
        </OGDialogDescription>
        <div className="flex h-[80vh] max-h-[760px] flex-col">
          <div className="flex flex-col gap-3 border-b border-border-light px-6 pb-4 pt-5">
            <OGDialogTitle className="pr-10 text-base font-semibold text-text-primary">
              {localize('com_ui_skills')}
            </OGDialogTitle>

            <div className="flex items-center gap-2">
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
              <label id="skills-view-label" className="sr-only">
                {localize('com_ui_skills_filter')}
              </label>
              <Radio
                options={viewOptions}
                value={view}
                onChange={(value) => setView(value as SkillView)}
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
              emptyKey={emptyKey}
              ariaLabel={localize('com_ui_skills')}
            />
          </div>
        </div>
        <ItemDialog item={detailItem} agentId={agentId} onClose={() => setDetailItem(null)} />
      </OGDialogContent>
    </OGDialog>
  );
}
