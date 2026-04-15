import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Panel, Text, Separator, Container } from '@clickhouse/click-ui';
import type { CostEntry } from './types';
import { CH_BG_MUTED } from './types';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export function formatCHC(value: number): string {
  if (value === 0) {
    return '0 CHC';
  }
  if (value > 0 && value < 0.001) {
    return '<0.001 CHC';
  }
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} CHC`;
}

interface CostViewProps {
  costs: CostEntry[];
  grandTotalCHC: number;
  codeTheme: 'light' | 'dark';
}

type ViewMode = 'date' | 'entity';

/** Parse YYYY-MM-DD as a local date (avoids UTC-midnight shift from `new Date(str)`). */
function parseLocalDate(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return null;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function localISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDateRange(costs: CostEntry[]): { days: number; start: Date; end: Date } {
  if (costs.length === 0) {
    const empty = new Date(0);
    return { days: 0, start: empty, end: empty };
  }
  const dates = costs
    .map((c) => parseLocalDate(c.date))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  const start = dates[0];
  const end = dates[dates.length - 1];
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return { days, start, end };
}

type TimeLevel = 'day' | 'week';

function getWeekLabel(date: Date): string {
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  return `${startOfWeek.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${endOfWeek.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function getGroupKey(date: Date, level: TimeLevel): string {
  switch (level) {
    case 'week': {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay());
      return localISODate(startOfWeek);
    }
    case 'day':
      return localISODate(date);
  }
}

function getGroupLabel(key: string, level: TimeLevel): string {
  const d = parseLocalDate(key) ?? new Date(0);
  switch (level) {
    case 'week':
      return getWeekLabel(d);
    case 'day':
      return d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
  }
}

interface TimeGroup {
  key: string;
  label: string;
  total: number;
  children: TimeGroup[] | CostEntry[];
  isLeaf: boolean;
}

function buildTimeHierarchy(costs: CostEntry[], levels: TimeLevel[]): TimeGroup[] {
  if (levels.length === 0) {
    return [];
  }

  const [currentLevel, ...remainingLevels] = levels;
  const groups = new Map<string, CostEntry[]>();

  for (const cost of costs) {
    const date = parseLocalDate(cost.date);
    if (!date) {
      continue;
    }
    const key = getGroupKey(date, currentLevel);
    const existing = groups.get(key) ?? [];
    existing.push(cost);
    groups.set(key, existing);
  }

  const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));

  const built = sorted.map(([key, entries]) => {
    const total = entries.reduce((sum, c) => sum + c.totalCHC, 0);
    const label = getGroupLabel(key, currentLevel);

    if (remainingLevels.length === 0) {
      return { key, label, total, children: entries, isLeaf: true } as TimeGroup;
    }
    return {
      key,
      label,
      total,
      children: buildTimeHierarchy(entries, remainingLevels),
      isLeaf: false,
    } as TimeGroup;
  });

  return built;
}

interface EntityGroup {
  name: string;
  type: string;
  total: number;
  entries: CostEntry[];
}

function buildEntityGroups(costs: CostEntry[]): EntityGroup[] {
  const groups = new Map<string, EntityGroup>();

  for (const cost of costs) {
    const existing = groups.get(cost.entityId);
    if (existing) {
      existing.total += cost.totalCHC;
      existing.entries.push(cost);
    } else {
      groups.set(cost.entityId, {
        name: cost.entityName,
        type: cost.entityType,
        total: cost.totalCHC,
        entries: [cost],
      });
    }
  }

  return [...groups.values()].sort((a, b) => b.total - a.total);
}

function MetricsList({ metrics }: { metrics: Record<string, number> }) {
  const nonZero = Object.entries(metrics).filter(([, v]) => v > 0);
  if (nonZero.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {nonZero.map(([key, value]) => (
        <div key={key} className="flex items-baseline gap-1.5">
          <Text size="md" color="muted">
            {key.replace(/CHC$/, '')}
          </Text>
          <Text size="md">{formatCHC(value)}</Text>
        </div>
      ))}
    </div>
  );
}

function CostEntryRow({ entry }: { entry: CostEntry }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-1.5">
      <div className="flex items-center justify-between">
        <Text size="md" weight="medium">
          {entry.entityName}
        </Text>
        <Text size="md">{formatCHC(entry.totalCHC)}</Text>
      </div>
      <div className="flex items-center gap-2">
        <Text size="md" color="muted">
          {entry.entityType}
        </Text>
        {entry.totalCHC > 0 && <MetricsList metrics={entry.metrics} />}
      </div>
    </div>
  );
}

function CollapsibleSection({
  label,
  total,
  children,
  defaultOpen = false,
  codeTheme,
}: {
  label: string;
  total: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  codeTheme: 'light' | 'dark';
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Panel padding="none" gap="none" radii="sm" hasBorder orientation="vertical" fillWidth>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full cursor-pointer items-center justify-between rounded px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
        style={{ background: CH_BG_MUTED[codeTheme] }}
      >
        <Text size="md" weight="medium">
          {label}
        </Text>
        <div className="flex items-center gap-2">
          <Text size="md" color="muted">
            {formatCHC(total)}
          </Text>
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 transition-transform duration-200 ease-out',
              open && 'rotate-180',
            )}
            style={{ color: 'var(--text-secondary)' }}
            aria-hidden="true"
          />
        </div>
      </button>
      {open && <div className="w-full">{children}</div>}
    </Panel>
  );
}

function TimeGroupView({ group, codeTheme }: { group: TimeGroup; codeTheme: 'light' | 'dark' }) {
  if (group.isLeaf) {
    const entries = group.children as CostEntry[];
    return (
      <CollapsibleSection label={group.label} total={group.total} codeTheme={codeTheme}>
        {entries.map((entry, i) => (
          <div key={`${entry.entityId}-${i}`}>
            <CostEntryRow entry={entry} />
            {i < entries.length - 1 && <Separator size="md" />}
          </div>
        ))}
      </CollapsibleSection>
    );
  }

  const children = group.children as TimeGroup[];
  return (
    <CollapsibleSection label={group.label} total={group.total} codeTheme={codeTheme}>
      <div className="flex w-full flex-col gap-2 p-2">
        {children.map((child) => (
          <TimeGroupView key={child.key} group={child} codeTheme={codeTheme} />
        ))}
      </div>
    </CollapsibleSection>
  );
}

function DateView({ costs, codeTheme }: { costs: CostEntry[]; codeTheme: 'light' | 'dark' }) {
  const localize = useLocalize();
  const { days } = useMemo(() => getDateRange(costs), [costs]);
  const [groupByWeek, setGroupByWeek] = useState(days > 7);
  const hierarchy = useMemo(() => {
    const levels: TimeLevel[] = groupByWeek ? ['week', 'day'] : ['day'];
    return buildTimeHierarchy(costs, levels);
  }, [costs, groupByWeek]);

  return (
    <div>
      {days > 7 && (
        <div className="mb-2 flex justify-end">
          <div className="flex gap-1 rounded-md bg-surface-tertiary p-0.5">
            <button
              type="button"
              onClick={() => setGroupByWeek(false)}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                !groupByWeek ? 'bg-surface-primary text-text-primary' : 'text-text-secondary',
              )}
            >
              {localize('com_ch_cost_daily')}
            </button>
            <button
              type="button"
              onClick={() => setGroupByWeek(true)}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                groupByWeek ? 'bg-surface-primary text-text-primary' : 'text-text-secondary',
              )}
            >
              {localize('com_ch_cost_weekly')}
            </button>
          </div>
        </div>
      )}
      <div className="flex max-h-[400px] flex-col gap-2 overflow-auto">
        {hierarchy.map((group) => (
          <TimeGroupView key={group.key} group={group} codeTheme={codeTheme} />
        ))}
      </div>
    </div>
  );
}

function EntityView({ costs, codeTheme }: { costs: CostEntry[]; codeTheme: 'light' | 'dark' }) {
  const localize = useLocalize();
  const groups = useMemo(() => buildEntityGroups(costs), [costs]);
  const { days } = useMemo(() => getDateRange(costs), [costs]);
  const [groupByWeek, setGroupByWeek] = useState(days > 7);

  return (
    <div>
      {days > 7 && (
        <div className="mb-2 flex justify-end">
          <div className="flex gap-1 rounded-md bg-surface-tertiary p-0.5">
            <button
              type="button"
              onClick={() => setGroupByWeek(false)}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                !groupByWeek ? 'bg-surface-primary text-text-primary' : 'text-text-secondary',
              )}
            >
              {localize('com_ch_cost_daily')}
            </button>
            <button
              type="button"
              onClick={() => setGroupByWeek(true)}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                groupByWeek ? 'bg-surface-primary text-text-primary' : 'text-text-secondary',
              )}
            >
              {localize('com_ch_cost_weekly')}
            </button>
          </div>
        </div>
      )}
      <div className="flex max-h-[400px] flex-col gap-2 overflow-auto">
        {groups.map((group) => (
          <CollapsibleSection
            key={group.name}
            label={group.name}
            total={group.total}
            codeTheme={codeTheme}
          >
            <div className="px-3 py-1.5">
              <span className="rounded-full bg-surface-tertiary px-2.5 py-0.5 text-xs text-text-secondary">
                {group.type}
              </span>
            </div>
            {groupByWeek
              ? buildTimeHierarchy(group.entries, ['week']).map((week, wi, weekArr) => (
                  <div key={week.key}>
                    <div className="flex items-center justify-between px-3 py-1.5">
                      <Text size="md" weight="medium">
                        {week.label}
                      </Text>
                      <Text size="md">{formatCHC(week.total)}</Text>
                    </div>
                    {(week.children as CostEntry[]).map((entry, i) => (
                      <div key={`${entry.date}-${i}`}>
                        <div className="flex flex-col gap-1 px-3 py-1 pl-6">
                          <div className="flex items-center justify-between">
                            <Text size="md" color="muted">
                              {(parseLocalDate(entry.date) ?? new Date(0)).toLocaleDateString(
                                undefined,
                                { month: 'short', day: 'numeric' },
                              )}
                            </Text>
                            <Text size="md">{formatCHC(entry.totalCHC)}</Text>
                          </div>
                          {entry.totalCHC > 0 && <MetricsList metrics={entry.metrics} />}
                        </div>
                      </div>
                    ))}
                    {wi < weekArr.length - 1 && <Separator size="md" />}
                  </div>
                ))
              : group.entries.map((entry, i) => (
                  <div key={`${entry.date}-${i}`}>
                    <div className="flex flex-col gap-1 px-3 py-1.5">
                      <div className="flex items-center justify-between">
                        <Text size="md" color="muted">
                          {(parseLocalDate(entry.date) ?? new Date(0)).toLocaleDateString(
                            undefined,
                            { month: 'short', day: 'numeric', year: 'numeric' },
                          )}
                        </Text>
                        <Text size="md">{formatCHC(entry.totalCHC)}</Text>
                      </div>
                      {entry.totalCHC > 0 && <MetricsList metrics={entry.metrics} />}
                    </div>
                    {i < group.entries.length - 1 && <Separator size="md" />}
                  </div>
                ))}
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );
}

export function ClickHouseCostView({ costs, grandTotalCHC, codeTheme }: CostViewProps) {
  const localize = useLocalize();
  const [viewMode, setViewMode] = useState<ViewMode>('entity');

  return (
    <div className="flex w-full flex-col gap-2">
      <Container
        orientation="horizontal"
        padding="none"
        gap="none"
        justifyContent="space-between"
        alignItems="center"
      >
        <Text size="md" weight="medium">
          {localize('com_ch_cost_total', { value: formatCHC(grandTotalCHC) })}
        </Text>
        <div className="flex gap-1 rounded-md bg-surface-tertiary p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('entity')}
            className={cn(
              'rounded px-2 py-1 text-xs transition-colors',
              viewMode === 'entity'
                ? 'bg-surface-primary text-text-primary'
                : 'text-text-secondary',
            )}
          >
            {localize('com_ch_cost_by_entity')}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('date')}
            className={cn(
              'rounded px-2 py-1 text-xs transition-colors',
              viewMode === 'date' ? 'bg-surface-primary text-text-primary' : 'text-text-secondary',
            )}
          >
            {localize('com_ch_cost_by_date')}
          </button>
        </div>
      </Container>

      {viewMode === 'date' && <DateView costs={costs} codeTheme={codeTheme} />}
      {viewMode === 'entity' && <EntityView costs={costs} codeTheme={codeTheme} />}
    </div>
  );
}
