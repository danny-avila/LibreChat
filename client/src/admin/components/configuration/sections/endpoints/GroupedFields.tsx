import { useContext } from 'react';
import type * as t from '~/admin/types';
import { RowFilterContext } from '~/admin/contexts/RowFilterContext';
import { useCollapsibleSection } from '../../useCollapsibleSection';
import { useLocalize, useGlobalTitleBlock } from '~/admin/hooks';
import { renderCollapsible } from '../../renderCollapsible';
import { FIELD_GROUPS, flattenGroupFields } from './groups';
import { DecorativeIcon } from '~/admin/components/shared';
import { cn, isRowVisible } from '~/admin/utils';
import { InfoBanner } from '../../InfoBanner';

const TITLE_GROUP_KEY = 'com_admin_config_group_title_generation';

function FieldGroup({
  labelKey,
  fields,
  parentValue,
  parentPath,
  onChange,
  disabled,
  defaultExpanded,
  collectionRenderOverrides,
  editSessionId,
  lockedKeys,
}: {
  labelKey: string;
  fields: t.SchemaField[];
  parentValue: t.ConfigValue;
  parentPath: string;
  onChange: (path: string, value: t.ConfigValue) => void;
  disabled?: boolean;
  defaultExpanded: boolean;
  collectionRenderOverrides?: Record<string, t.CollectionRenderFields>;
  editSessionId?: number;
  lockedKeys?: ReadonlySet<string>;
}) {
  const localize = useLocalize();
  const rowFilter = useContext(RowFilterContext);
  const globalTitles = useGlobalTitleBlock();
  const showsGlobalNotice = globalTitles && labelKey === TITLE_GROUP_KEY;
  const paths = fields.map((field) => `${parentPath}.${field.key}`);
  const { isExpanded, hasEverExpanded, sectionRef, toggle } = useCollapsibleSection({
    defaultExpanded,
    revealPaths: paths,
  });

  if (!paths.some((path) => isRowVisible(rowFilter, path))) return null;

  return (
    <section ref={sectionRef} className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-(--cui-color-stroke-default)">
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={toggle}
          className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border-none bg-transparent py-2 pr-0 pl-1 transition-colors outline-none select-none hover:bg-(--cui-color-background-hover) focus-visible:bg-(--cui-color-background-hover)"
        >
          <span
            className={cn(
              'flex shrink-0 items-center justify-center transition-transform duration-200',
              isExpanded && 'rotate-90',
            )}
          >
            <DecorativeIcon name="chevron-right" size="xs" />
          </span>
          <span className="text-xs font-medium text-(--cui-color-text-muted)">
            {localize(labelKey)}
          </span>
        </button>
      </div>
      {renderCollapsible(
        isExpanded,
        hasEverExpanded,
        <div className="flex flex-col gap-3 pt-1">
          {showsGlobalNotice && (
            <InfoBanner
              text={localize('com_admin_config_global_titles_endpoint_banner')}
              dismissible={false}
            />
          )}
          {flattenGroupFields(
            fields,
            parentValue,
            parentPath,
            onChange,
            localize,
            disabled,
            collectionRenderOverrides,
            editSessionId,
            lockedKeys,
          )}
        </div>,
      )}
    </section>
  );
}

export function GroupedFieldRenderer({
  groupKey,
  fields,
  parentValue,
  parentPath,
  onChange,
  disabled,
  collectionRenderOverrides,
  editSessionId,
  lockedKeys,
}: {
  groupKey: string;
  fields: t.SchemaField[];
  parentValue: t.ConfigValue;
  parentPath: string;
  onChange: (path: string, value: t.ConfigValue) => void;
  disabled?: boolean;
  collectionRenderOverrides?: Record<string, t.CollectionRenderFields>;
  editSessionId?: number;
  /** Fields shown read-only (the name of a librechat.yaml endpoint, D1). */
  lockedKeys?: ReadonlySet<string>;
}) {
  const groups = FIELD_GROUPS[groupKey];
  if (!groups) return null;

  const allGroupedKeys = new Set(groups.flatMap((g) => g.fields));
  const fieldsByKey = new Map(fields.map((f) => [f.key, f]));
  const ungrouped = fields.filter((f) => !allGroupedKeys.has(f.key));

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => {
        const groupFields = group.fields
          .map((key) => fieldsByKey.get(key))
          .filter((f): f is t.SchemaField => f != null);
        return (
          <FieldGroup
            key={group.labelKey}
            labelKey={group.labelKey}
            fields={groupFields}
            parentValue={parentValue}
            parentPath={parentPath}
            onChange={onChange}
            disabled={disabled}
            defaultExpanded={group.defaultExpanded}
            collectionRenderOverrides={collectionRenderOverrides}
            editSessionId={editSessionId}
            lockedKeys={lockedKeys}
          />
        );
      })}
      {ungrouped.length > 0 && (
        <FieldGroup
          labelKey="com_admin_config_group_advanced"
          fields={ungrouped}
          parentValue={parentValue}
          parentPath={parentPath}
          onChange={onChange}
          disabled={disabled}
          defaultExpanded={false}
          collectionRenderOverrides={collectionRenderOverrides}
          editSessionId={editSessionId}
          lockedKeys={lockedKeys}
        />
      )}
    </div>
  );
}
