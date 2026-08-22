import { useState } from 'react';
import { useAtom } from 'jotai';
import { ChevronDown, ExternalLink } from 'lucide-react';
import {
  Button,
  Collapsible,
  MeterSwatch,
  SegmentedMeter,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@librechat/client';
import type { MeterSegment } from '@librechat/client';
import type { TokenUsageView } from '~/hooks/Chat/useTokenUsage';
import type { CurrencyConfig } from '~/utils';
import { groupToolTokens, formatTokens, formatCost } from '~/utils';
import { contextBreakdownExpandedAtom } from '~/store/usage';
import { useLocalize } from '~/hooks';

interface RowProps {
  label: string;
  value: number;
  max?: number;
  /** Present only when the row corresponds to real estate in the meter */
  segment?: Pick<MeterSegment, 'slot' | 'hatched' | 'outlined'>;
  /** The free-space remainder, keyed to the bare track rather than a series */
  track?: boolean;
  /** Meter segment this row keys; hovering it highlights its slice of the bar */
  id?: string;
  onHoverChange?: (id: string | null) => void;
}

function Row({ label, value, max, segment, track, id, onHoverChange }: RowProps) {
  const percent = max != null && max > 0 ? Math.min((value / max) * 100, 100) : null;
  return (
    <div
      className="flex items-center justify-between gap-4 text-sm"
      onPointerEnter={id != null ? () => onHoverChange?.(id) : undefined}
      onPointerLeave={id != null ? () => onHoverChange?.(null) : undefined}
    >
      <span className="flex min-w-0 items-center gap-2">
        {segment != null && <MeterSwatch segment={segment} />}
        {track === true && (
          <span
            aria-hidden="true"
            className="size-2 flex-none rounded-sm bg-surface-tertiary ring-1 ring-inset ring-border-medium"
          />
        )}
        <span className="text-text-secondary">{label}</span>
      </span>
      <span className="font-medium text-text-primary">
        {formatTokens(value)}
        {percent != null && (
          <span className="ml-1 text-xs text-text-secondary" aria-hidden="true">
            ({Math.round(percent)}%)
          </span>
        )}
      </span>
    </div>
  );
}

interface BreakdownProps {
  view: TokenUsageView;
  showCost: boolean;
  currency?: CurrencyConfig;
  langfuseSessionUrl?: string;
}

export default function Breakdown({
  view,
  showCost,
  currency,
  langfuseSessionUrl,
}: BreakdownProps) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useAtom(contextBreakdownExpandedAtom);
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const { usedTokens, maxTokens, percent, snapshot, snapshotActive, branchUsage, hasUsage } = view;
  /** Show the all-branches total only when it (a) exceeds the active branch —
   *  epsilon guards against float summation order surfacing a spurious row in an
   *  unbranched conversation — and (b) has COMPLETE cost coverage, so a sibling
   *  branch saved without cost can't render an under-reported total. */
  const showTotal = view.totalUsage.costKnown && view.totalCost - view.branchCost > 1e-9;

  const breakdown = snapshotActive ? snapshot?.breakdown : undefined;
  const instructionTokens =
    snapshot?.effectiveInstructionTokens ?? breakdown?.instructionTokens ?? 0;
  const systemTokens =
    (breakdown?.systemMessageTokens ?? 0) + (breakdown?.dynamicInstructionTokens ?? 0);
  /** Summary has its own row, so exclude it (it's part of `usedTokens`) to avoid
   *  double-counting it inside the Messages row on a summarized turn. */
  const messageTokens = Math.max(
    0,
    usedTokens - instructionTokens - (breakdown?.summaryTokens ?? 0),
  );
  const freeTokens = maxTokens != null ? Math.max(0, maxTokens - usedTokens) : null;

  const groups =
    breakdown?.toolTokenCounts != null
      ? groupToolTokens(breakdown.toolTokenCounts, breakdown.deferredToolNames)
      : null;

  /** Single source of truth for both the meter and its legend: a row carries a
   *  swatch if and only if it is a segment, so the two can never disagree.
   *  Deferred tools keep their family's slot and are hatched — same identity,
   *  held out of the active set. */
  const segments: Array<MeterSegment & { label: string }> =
    breakdown == null
      ? []
      : [
          {
            id: 'messages',
            label: localize('com_ui_context_messages'),
            value: messageTokens,
            slot: 1,
          },
          { id: 'system', label: localize('com_ui_context_system'), value: systemTokens, slot: 2 },
          ...(groups == null
            ? [
                {
                  id: 'tools',
                  label: localize('com_ui_context_tools'),
                  value: breakdown.toolSchemaTokens,
                  slot: 3,
                },
              ]
            : [
                {
                  id: 'tools-system',
                  label: localize('com_ui_context_tools_system'),
                  value: groups.system,
                  slot: 3,
                },
                {
                  id: 'tools-system-deferred',
                  label: localize('com_ui_context_tools_system_deferred'),
                  value: groups.systemDeferred,
                  slot: 3,
                  hatched: true,
                },
                {
                  id: 'tools-mcp',
                  label: localize('com_ui_context_tools_mcp'),
                  value: groups.mcp,
                  slot: 4,
                },
                {
                  id: 'tools-mcp-deferred',
                  label: localize('com_ui_context_tools_mcp_deferred'),
                  value: groups.mcpDeferred,
                  slot: 4,
                  hatched: true,
                },
                { id: 'skills', label: localize('com_ui_skills'), value: groups.skills, slot: 5 },
                {
                  id: 'subagents',
                  label: localize('com_ui_context_subagents'),
                  value: groups.subagents,
                  slot: 6,
                },
              ]),
          {
            id: 'summary',
            label: localize('com_ui_context_summary'),
            value: breakdown.summaryTokens,
            slot: 7,
          },
        ];

  /** The estimate path knows the total but not the composition, so it keeps a
   *  single unsegmented fill and its rows carry no swatches. */
  const meterSegments: MeterSegment[] =
    segments.length > 0 ? segments : [{ id: 'used', value: usedTokens, slot: 1 }];

  /** A hovered row can vanish mid-hover (live snapshot update, or the view
   *  falling back to the estimate path, whose rows carry no hover pairing);
   *  without its pointerleave a stale id would dim every segment. Clear the
   *  state rather than masking it, so a stale highlight cannot return if the
   *  row reappears with the pointer elsewhere. Render-phase reset: React
   *  re-renders immediately and never commits the stale highlight. */
  const hoverIsValid = (id: string): boolean =>
    id === 'free'
      ? breakdown != null && freeTokens != null
      : meterSegments.some((segment) => segment.id === id && segment.value > 0);
  if (hoveredSegment != null && !hoverIsValid(hoveredSegment)) {
    setHoveredSegment(null);
  }
  const activeSegment =
    hoveredSegment != null && hoverIsValid(hoveredSegment) ? hoveredSegment : null;

  return (
    <div role="region" aria-label={localize('com_ui_context_usage')}>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger
          className="group flex w-full items-center justify-between gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
          data-testid="context-breakdown-toggle"
        >
          <span className="whitespace-nowrap text-sm font-medium text-text-primary">
            {localize('com_ui_context_window')}
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap text-xs font-medium text-text-secondary">
            {maxTokens != null
              ? `${formatTokens(usedTokens)} / ${formatTokens(maxTokens)} (${Math.round(percent)}%)`
              : formatTokens(usedTokens)}
            <ChevronDown
              aria-hidden="true"
              className="size-3.5 shrink-0 text-text-tertiary transition-transform duration-300 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            />
          </span>
        </CollapsibleTrigger>

        <SegmentedMeter
          className="mt-3"
          segments={maxTokens != null ? meterSegments : []}
          max={maxTokens ?? 1}
          highlightId={activeSegment}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={maxTokens != null ? Math.round(percent) : undefined}
          aria-label={localize('com_ui_context_usage')}
        />

        {/* The gap to the meter lives INSIDE the animated element (mt-3 below),
            so it collapses with the height. On the parent it would be a margin
            outside the animation, and unmounting the content would drop it in a
            single 12px jump after the height reached zero. */}
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none">
          <div className="mt-3 space-y-3">
            <div
              className="space-y-1.5"
              data-testid={breakdown ? 'context-breakdown' : 'context-estimate'}
            >
              {breakdown ? (
                <>
                  {segments.map(
                    ({ id, label, value, ...segment }) =>
                      value > 0 && (
                        <Row
                          key={id}
                          label={label}
                          value={value}
                          max={maxTokens}
                          segment={segment}
                          id={id}
                          onHoverChange={setHoveredSegment}
                        />
                      ),
                  )}
                  {freeTokens != null && (
                    <Row
                      label={localize('com_ui_context_free')}
                      value={freeTokens}
                      max={maxTokens}
                      track
                      id="free"
                      onHoverChange={setHoveredSegment}
                    />
                  )}
                </>
              ) : (
                <>
                  {view.branchTotals.summaryBaseline > 0 && (
                    <Row
                      label={localize('com_ui_context_summary')}
                      value={view.branchTotals.summaryBaseline}
                      max={maxTokens}
                    />
                  )}
                  {view.messagesPruned ? (
                    /** Over-window: the per-category split no longer describes what's
                     *  sent, so show the pruned message total (incl. in-flight). */
                    <Row
                      label={localize('com_ui_context_messages')}
                      value={view.messageTokens + view.liveTokens}
                      max={maxTokens}
                    />
                  ) : (
                    <>
                      <Row label={localize('com_ui_input')} value={view.branchTotals.input} />
                      <Row
                        label={localize('com_ui_output')}
                        value={view.branchTotals.output + view.liveTokens}
                      />
                      {view.estimatedTokens > 0 && (
                        <Row
                          label={localize('com_ui_context_estimated')}
                          value={view.estimatedTokens}
                        />
                      )}
                    </>
                  )}
                  {view.overheadTokens > 0 && (
                    <Row label={localize('com_ui_context_system')} value={view.overheadTokens} />
                  )}
                  {maxTokens == null && (
                    <p className="text-xs text-text-secondary">
                      {localize('com_ui_context_unknown')}
                    </p>
                  )}
                  <p className="text-xs italic text-text-secondary">
                    {localize('com_ui_estimated')}
                  </p>
                </>
              )}
            </div>

            {hasUsage && (
              <>
                <div className="border-t border-border-light" role="separator" />
                <div className="space-y-1.5" data-testid="token-usage-totals">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {localize('com_ui_context_totals')}
                  </h3>
                  <Row label={localize('com_ui_input')} value={branchUsage.input} />
                  <Row label={localize('com_ui_output')} value={branchUsage.output} />
                  {branchUsage.cacheRead > 0 && (
                    <Row label={localize('com_ui_cache_read')} value={branchUsage.cacheRead} />
                  )}
                  {branchUsage.cacheWrite > 0 && (
                    <Row label={localize('com_ui_cache_write')} value={branchUsage.cacheWrite} />
                  )}
                </div>
              </>
            )}

            {showCost && hasUsage && branchUsage.costKnown && (
              <>
                <div className="border-t border-border-light" role="separator" />
                <div className="space-y-1.5" data-testid="token-usage-cost">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">
                      {showTotal
                        ? localize('com_ui_context_cost_branch')
                        : localize('com_ui_context_cost')}
                    </span>
                    <span className="font-medium text-text-primary">
                      {formatCost(view.branchCost, currency)}
                    </span>
                  </div>
                  {showTotal && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary">
                        {localize('com_ui_context_cost_total')}
                      </span>
                      <span className="text-text-secondary">
                        {formatCost(view.totalCost, currency)}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}

            {langfuseSessionUrl && (
              <>
                <div className="border-t border-border-light" role="separator" />
                <Button asChild variant="link" className="h-auto w-full justify-between gap-2 p-0">
                  <a href={langfuseSessionUrl} target="_blank" rel="noopener noreferrer">
                    <span>{localize('com_ui_langfuse_view_session')}</span>
                    <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
                  </a>
                </Button>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
