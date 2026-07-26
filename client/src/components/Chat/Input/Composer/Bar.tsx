import React, { memo, useMemo, useState } from 'react';
import * as Ariakit from '@ariakit/react';
import { TooltipAnchor, SendIcon } from '@librechat/client';
import { X, Mic, Check, Square, ChevronDown } from 'lucide-react';
import type { TConversation, EModelEndpoint, EndpointFileConfig } from 'librechat-data-provider';
import type { PaletteEntry, PaletteMode } from '~/hooks/Input/usePaletteEntries';
import type { Dictation } from '~/hooks/Input/useDictation';
import type { ExtendedFile, FileSetter } from '~/common';
import usePaletteEntries from '~/hooks/Input/usePaletteEntries';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import useElementSize from '~/hooks/Generic/useElementSize';
import useChipPacking from '~/hooks/Input/useChipPacking';
import { useBadgeRowContext } from '~/Providers';
import TokenUsage from '../TokenUsage';
import { useLocalize } from '~/hooks';
import Thinking from './Thinking';
import Palette from './Palette';
import { cn } from '~/utils';
import Chip from './Chip';

/** Stable identity so the memo below is not defeated when tools are hidden. */
const EMPTY_ENTRIES: PaletteEntry[] = [];

/** Matches the rows' `gap-1.5`, which the split arithmetic has to account for. */
const CHIP_GAP = 6;

/**
 * Whether every chip fits on the button row beside the `+` and the controls.
 *
 * All or nothing: chips share that row only while they are few enough to need
 * no row of their own. Once they do not fit they all move to a row above, so
 * the buttons keep a row of their own rather than being crowded by whichever
 * two or three chips happened to be left over.
 */
function chipsFitInline<T extends { key: string }>(
  entries: T[],
  widths: Record<string, number>,
  capacity: number,
): boolean {
  if (entries.length === 0) {
    return true;
  }
  if (capacity <= 0) {
    return false;
  }
  let used = 0;
  for (const entry of entries) {
    const width = widths[entry.key];
    /* Before the first measuring pass nothing is known, so everything stays on
       one row — the same unmeasured state the packing order starts from. */
    if (width == null) {
      return true;
    }
    used += width + (used > 0 ? CHIP_GAP : 0);
    if (used > capacity) {
      return false;
    }
  }
  return true;
}

function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function RoundButton({
  label,
  onClick,
  children,
  primary = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <TooltipAnchor
      description={label}
      disabled={disabled}
      render={
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          disabled={disabled}
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
            'disabled:cursor-not-allowed disabled:opacity-40',
            primary
              ? 'bg-text-primary text-surface-primary hover:opacity-90'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
          )}
        >
          {children}
        </button>
      }
    />
  );
}

/**
 * Sub-mode switch carried on the chip itself, so Artifacts' generation mode can
 * be changed without reopening the palette. Real menu items, unlike the
 * pointer-only pills inside the palette's `option` rows.
 */
function ChipModes({ modes }: { modes: PaletteMode[] }) {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const active = modes.find((mode) => mode.active);

  return (
    <Ariakit.MenuProvider open={open} setOpen={setOpen} placement="bottom">
      <Ariakit.MenuButton
        aria-label={localize('com_ui_mode')}
        onClick={(e) => e.stopPropagation()}
        className="-mr-0.5 flex shrink-0 items-center gap-0.5 rounded px-1 text-xs text-text-secondary transition-colors hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy"
      >
        {active != null && <span className="max-w-[7rem] truncate">{active.label}</span>}
        <ChevronDown
          className={cn('animate-composer-icon size-3 shrink-0 opacity-70', open && '-rotate-180')}
          aria-hidden="true"
        />
      </Ariakit.MenuButton>
      {/* Same entrance as the palette and the thinking popup, and the same
          anchored origin, so it grows out of the chip in whichever direction it
          ends up opening. */}
      <Ariakit.Menu
        portal
        gutter={6}
        unmountOnHide
        className="animate-composer-popover z-50 min-w-[10rem] rounded-xl border border-border-light bg-presentation p-1 shadow-lg outline-none"
      >
        {modes.map((mode) => (
          <Ariakit.MenuItem
            key={mode.id}
            hideOnClick={false}
            role="menuitemradio"
            aria-checked={mode.active}
            onClick={mode.onSelect}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm text-text-secondary data-[active-item]:bg-surface-hover data-[active-item]:text-text-primary"
          >
            <span className="truncate">{mode.label}</span>
            {mode.active && <Check className="size-4 shrink-0" aria-hidden="true" />}
          </Ariakit.MenuItem>
        ))}
      </Ariakit.Menu>
    </Ariakit.MenuProvider>
  );
}

interface BarProps {
  index: number;
  isRTL: boolean;
  disabled: boolean;
  agentId?: string | null;
  endpoint?: string | null;
  endpointType?: EModelEndpoint | string;
  endpointFileConfig?: EndpointFileConfig;
  useResponsesApi?: boolean;
  conversationId: string;
  conversation: TConversation | null;
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  canAttach: boolean;
  /** The composer box, which the palette anchors to instead of its own button. */
  anchorRef: React.RefObject<HTMLElement>;
  /** Mirrors the old `showEphemeralBadges` gate: agents and assistants carry
   *  their own tool config, and a spec can suppress the row outright. */
  showTools: boolean;
  isSubmitting: boolean;
  showSpeech: boolean;
  speechDisabled: boolean;
  /** Send, stop or the during-run split button, decided by the caller. */
  actionSlot: React.ReactNode;
  /** Owned by `ChatForm`, which also paints the trace over the textarea. */
  dictation: Dictation;
}

/**
 * The composer's action bar. The palette and the chips for whatever tools are
 * currently on sit left; model/effort, context, speech and send sit right.
 * Inactive tools never appear here, which is what removes the old row's
 * overflow as a class of bug.
 */
function Bar({
  index,
  isRTL,
  disabled,
  agentId,
  endpoint,
  endpointType,
  endpointFileConfig,
  useResponsesApi,
  conversationId,
  conversation,
  files,
  setFiles,
  setFilesLoading,
  canAttach,
  anchorRef,
  showTools,
  isSubmitting,
  showSpeech,
  speechDisabled,
  actionSlot,
  dictation,
}: BarProps) {
  const localize = useLocalize();
  const context = useBadgeRowContext();
  const allEntries = usePaletteEntries({ conversationId, agentId });

  /* Servers with required variables open this before they can be selected; it
     lives here rather than in the palette so dismissing the popover mid-config
     does not unmount the dialog. */
  const mcpConfigProps = context?.mcpServerManager?.getConfigDialogProps();
  const entries = showTools ? allEntries : EMPTY_ENTRIES;

  /* Skills are excluded: a picked skill is staged context for the next turn, so
     it belongs in the tray above the textarea with the files and quotes, not in
     the row of things that stay switched on across turns. */
  const activeEntries = useMemo(
    () => entries.filter((entry) => entry.active && entry.section !== 'skill'),
    [entries],
  );
  /* Catalog order puts long skill and MCP names mid-row, stranding the rest of
     that row; packing widest-first fills the rows instead. */
  const { ordered: packedEntries, rootRef, widths } = useChipPacking(activeEntries);

  const { ref: rowRef, width: rowWidth } = useElementSize<HTMLDivElement>();
  const { ref: plusRef, width: plusWidth } = useElementSize<HTMLSpanElement>();
  const { ref: controlsRef, width: controlsWidth } = useElementSize<HTMLDivElement>();

  /* A row of their own once they need one, and it runs the full width of the
     composer — the `+` corner included, since the buttons are on the row below
     it rather than in the flow. */
  const inlineChips = useMemo(
    () =>
      chipsFitInline(packedEntries, widths, rowWidth - plusWidth - controlsWidth - CHIP_GAP * 2),
    [packedEntries, widths, rowWidth, plusWidth, controlsWidth],
  );
  const above = inlineChips ? EMPTY_ENTRIES : packedEntries;
  const inline = inlineChips ? packedEntries : EMPTY_ENTRIES;

  const rowClass = cn(
    'flex flex-wrap items-center gap-1.5',
    isRTL ? 'flex-row-reverse' : 'flex-row',
  );
  const barClass = cn('@container flex flex-col gap-1.5 px-2 pb-2');

  const renderChip = (entry: PaletteEntry) => (
    <Chip
      key={entry.key}
      tone="tool"
      label={entry.label}
      icon={entry.icon}
      iconClassName={entry.accent}
      trailing={entry.modes != null ? <ChipModes modes={entry.modes} /> : undefined}
      onRemove={entry.onSelect}
      removeLabel={localize('com_ui_remove_var', { 0: entry.label })}
      data-testid={`composer-active-${entry.itemType}`}
    />
  );

  /* While dictating the bar hands its three buttons over: `+` cancels, the mic
     stops into the composer, and send transcribes and sends. Everything else
     steps aside so the trace gets the full width. */
  if (dictation.active || dictation.transcribing) {
    return (
      <div
        className={cn(rowClass, 'flex-nowrap px-2 pb-2')}
        role="group"
        aria-label={localize('com_ui_listening')}
      >
        <RoundButton label={localize('com_ui_cancel')} onClick={dictation.cancel}>
          <X className="size-5" aria-hidden="true" />
        </RoundButton>
        <div className="flex min-w-0 flex-1 items-center px-1">
          <span className="text-xs tabular-nums text-text-secondary">
            {dictation.transcribing
              ? localize('com_ui_transcribing')
              : formatElapsed(dictation.elapsed)}
          </span>
        </div>
        <RoundButton label={localize('com_ui_stop')} onClick={dictation.stopToComposer}>
          <Square className="size-4 fill-current" aria-hidden="true" />
        </RoundButton>
        <RoundButton
          primary
          label={localize('com_nav_send_message')}
          onClick={dictation.stopAndSend}
        >
          <SendIcon size={18} />
        </RoundButton>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={barClass}>
      {/* Full-width rows, so the chips run right across the composer including
          the corner the `+` sits in. Labelled the same as the row below: one
          set of tools that happens to need two rows to fit. */}
      {above.length > 0 && (
        <div role="list" aria-label={localize('com_ui_composer_tools')} className={rowClass}>
          {above.map(renderChip)}
        </div>
      )}
      <div ref={rowRef} className={rowClass}>
        <span ref={plusRef} className="shrink-0">
          <Palette
            index={index}
            entries={entries}
            disabled={disabled}
            agentId={agentId}
            endpoint={endpoint}
            endpointType={endpointType}
            endpointFileConfig={endpointFileConfig}
            useResponsesApi={useResponsesApi}
            conversationId={conversationId}
            conversation={conversation}
            files={files}
            setFiles={setFiles}
            setFilesLoading={setFilesLoading}
            canAttach={canAttach}
            anchorRef={anchorRef}
          />
        </span>
        {/* `contents`, so these chips sit on the same line as the buttons rather
            than in a box of their own. The element keeps its list semantics for
            assistive tech; only its box is dropped. */}
        <div role="list" aria-label={localize('com_ui_composer_tools')} className="contents">
          {inline.map(renderChip)}
        </div>
        {/* Auto margin on the main-start side, so the group sits at the end of
            the row whether or not chips share it. */}
        <div
          ref={controlsRef}
          className={cn('flex shrink-0 items-center gap-1.5', isRTL ? 'mr-auto' : 'ml-auto')}
        >
          <Thinking />
          <TokenUsage index={index} conversation={conversation} isSubmitting={isSubmitting} />
          {showSpeech && (
            <RoundButton
              label={localize('com_ui_use_micrphone')}
              onClick={dictation.start}
              disabled={speechDisabled}
            >
              <Mic className="size-5" aria-hidden="true" />
            </RoundButton>
          )}
          {actionSlot}
        </div>
      </div>
      {mcpConfigProps && (
        <MCPConfigDialog
          {...mcpConfigProps}
          conversationId={conversationId}
          storageContextKey={context?.storageContextKey}
        />
      )}
    </div>
  );
}

export default memo(Bar);
