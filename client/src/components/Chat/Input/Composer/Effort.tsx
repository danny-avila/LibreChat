import { memo, useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { CircleHelp } from 'lucide-react';
import { Constants } from 'librechat-data-provider';
import { HoverCard, HoverCardTrigger, HoverCardContent, HoverCardPortal } from '@librechat/client';
import type { SettingDefinition, TConversation } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import type { TSetOption } from '~/common';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/** Values that mean "let the provider decide" rather than a graded level. They
 *  are lifted out of the track and offered as a separate Auto toggle, so the
 *  slider only ever expresses "how much".
 *
 *  `none` is deliberately NOT here: it is a real setting meaning "do not reason
 *  at all", and swallowing it hid the track's own first stop. */
export const AUTO_VALUES = new Set(['unset', 'auto', '']);

const TRACK_H = 24;
/** The thumb overhangs the rail slightly at rest and grows while held, so the
 *  row is sized to the largest it can get and the rail is banded inside it. */
const THUMB = 28;
const THUMB_ACTIVE = 32;
/** The fill clears before the thumb that covers it starts to fade. */
const FILL_FADE_MS = 90;
const THUMB_FADE_MS = 140;
type Localize = (key: TranslationKeys) => string;

/**
 * `enumMappings` maps a raw value to a translation KEY, not to display text —
 * rendering it directly is what leaks `com_ui_medium` into the UI. Shared with
 * the trigger button, which is the only place the level is named.
 */
export function resolveEffortLabel(
  setting: SettingDefinition,
  value: string,
  localize: Localize,
): string {
  const mapped = setting.enumMappings?.[value];
  if (mapped != null) {
    const key = String(mapped);
    const translated = localize(key as TranslationKeys);
    if (translated !== '' && translated !== key) {
      return translated;
    }
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface EffortProps {
  setting: SettingDefinition;
  conversation: TConversation | null;
  setOption: TSetOption;
}

/**
 * Reasoning effort as a filled track running from faster to smarter.
 *
 * The stops are named choices, not a continuum, so the interactive layer is a
 * radiogroup of segment hit-targets — correct arrow-key and screen-reader
 * behaviour for free — with pointer drag layered on top so the thumb can also
 * be swept the way a touch control behaves.
 *
 * The level is deliberately not named in here: the button that opens this owns
 * that, so the value never appears in two places at once.
 */
function Effort({ setting, conversation, setOption }: EffortProps) {
  const localize = useLocalize();
  const trackRef = useRef<HTMLDivElement>(null);
  /** Ref drives the gesture (pointermove fires before a state flush would land);
   *  the state only feeds styling. */
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const { levels, autoValue } = useMemo(() => {
    const options = (setting.options ?? []).map(String);
    return {
      levels: options.filter((option) => !AUTO_VALUES.has(option)),
      autoValue: options.find((option) => AUTO_VALUES.has(option)),
    };
  }, [setting.options]);

  const raw = conversation?.[setting.key as keyof TConversation];
  const current = raw == null ? undefined : String(raw);
  const isAuto = current == null || AUTO_VALUES.has(current);
  const activeIndex = isAuto ? -1 : levels.indexOf(current);

  /* The graded level Auto was turned on from. Two jobs: Auto has no position on
     the rail, so the fill and thumb hold this one while they fade (without it
     the thumb unmounted the instant Auto turned on and left the fill briefly
     naked, which flashed green), and switching Auto back off returns here
     instead of dumping the user on the lowest level.

     Held as a value rather than an index, and scoped to the conversation it was
     seen in: the option list differs per model, so an index carried across a
     model switch would point at a different level or none at all. Anything that
     no longer resolves falls back to the first level. */
  const conversationKey = conversation?.conversationId ?? '';
  const [remembered, setRemembered] = useState<{ key: string; value: string } | null>(null);
  if (
    activeIndex >= 0 &&
    current != null &&
    (remembered?.value !== current || remembered.key !== conversationKey)
  ) {
    setRemembered({ key: conversationKey, value: current });
  } else if (
    remembered != null &&
    remembered.key !== conversationKey &&
    (remembered.key === '' || remembered.key === Constants.NEW_CONVO)
  ) {
    /* A new chat carries a placeholder id until its first message lands. The
       level chosen before sending is still the same user in the same thread, so
       it follows the conversation into its real id rather than being dropped. */
    setRemembered({ key: conversationKey, value: remembered.value });
  }
  const rememberedIndex =
    remembered != null && remembered.key === conversationKey
      ? levels.indexOf(remembered.value)
      : -1;
  const restoreIndex = rememberedIndex >= 0 ? rememberedIndex : 0;
  const shownIndex = activeIndex >= 0 ? activeIndex : restoreIndex;

  const select = useCallback(
    (value: string) => setOption(setting.key)(value),
    [setOption, setting.key],
  );
  const label = useCallback(
    (value: string) => resolveEffortLabel(setting, value, localize),
    [setting, localize],
  );

  /**
   * Nearest stop to a pointer position, so a sweep snaps rather than drifts.
   *
   * Writes are coalesced to one per frame: a burst of moves within a single
   * task would each write from the same stale conversation snapshot, and an
   * earlier value could land last. Only the newest index is ever committed.
   */
  const pendingRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const selectFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || levels.length === 0) {
        return;
      }
      const rect = track.getBoundingClientRect();
      const usable = rect.width - THUMB;
      if (usable <= 0) {
        return;
      }
      const ratio = (clientX - rect.left - THUMB / 2) / usable;
      pendingRef.current = Math.round(Math.min(1, Math.max(0, ratio)) * (levels.length - 1));
      if (frameRef.current != null) {
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const index = pendingRef.current;
        pendingRef.current = null;
        if (index != null && levels[index] != null) {
          select(levels[index]);
        }
      });
    },
    [levels, select],
  );

  useEffect(
    () => () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  if (levels.length === 0) {
    return null;
  }

  const ratioOf = (index: number) => (levels.length === 1 ? 1 : index / (levels.length - 1));
  /* Anchored on the resting thumb size so its edge is flush with the rail at
     either end; while held it grows a couple of pixels past, which reads as the
     thumb lifting rather than as a misaligned track. */
  const centerOf = (index: number) =>
    `calc(${THUMB / 2}px + ${ratioOf(index)} * (100% - ${THUMB}px))`;
  /* Ends half a rail-height PAST the thumb's centre, which puts the fill's own
     rounded cap concentric with the thumb. The cap's radius (TRACK_H / 2) is
     smaller than the thumb's, so the thumb geometrically contains it at every
     position, including the first stop where the fill disappears entirely
     beneath it.
     That containment holds mid-animation too, because the offset is constant:
     collapsing to zero at the first stop instead left the fill briefly wider
     than the thumb could cover, which flashed green on the way down. */
  const fillWidth = (index: number) =>
    `calc(${THUMB / 2 + TRACK_H / 2}px + ${ratioOf(index)} * (100% - ${THUMB}px))`;

  const description = setting.description != null ? String(setting.description) : undefined;
  const descriptionText =
    description != null ? localize(description as TranslationKeys) : undefined;
  const thumbSize = dragging ? THUMB_ACTIVE : THUMB;
  const moveMs = dragging ? 75 : 150;

  return (
    <div className="w-[268px] p-3">
      <div
        ref={trackRef}
        role="radiogroup"
        aria-label={localize('com_ui_composer_thinking')}
        style={{ height: THUMB_ACTIVE }}
        onPointerDown={(e) => {
          /* Capture keeps the sweep alive past the track's edges. It throws for
             pointers the element never saw, which must not abort the gesture. */
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* no capture available — the drag still tracks via pointermove */
          }
          draggingRef.current = true;
          setDragging(true);
          selectFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) {
            selectFromPointer(e.clientX);
          }
        }}
        onPointerUp={(e) => {
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* nothing was captured */
          }
          draggingRef.current = false;
          setDragging(false);
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
          setDragging(false);
        }}
        className={cn(
          'relative w-full touch-none select-none transition-opacity duration-200',
          dragging ? 'cursor-grabbing' : 'cursor-pointer',
          /* Muted while the provider is deciding, so it reads as "not set by
             you" instead of "set to the lowest". Touching it takes over. */
          isAuto && 'opacity-60',
        )}
      >
        <span
          aria-hidden="true"
          style={{ height: TRACK_H }}
          className={cn(
            'absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full transition-colors',
            /* The border is always present and only its colour changes. Adding
               the border class on the way into Auto flipped its width 0 -> 1px
               with the colour animating up from `currentColor`, which flashed
               white, and the extra pixel nudged the centred label. */
            'border border-dashed',
            /* Not `surface-tertiary`: the popover itself is that colour now,
               and the rail would vanish into it. */
            isAuto ? 'border-border-heavy bg-transparent' : 'border-transparent bg-border-medium',
          )}
        />
        {/* Filled in LibreChat's own accent: the thumb is white and needs a
            colour to sit on, or it reads as a hole punched through the bar.
            Always mounted — unmounting it at the first stop made the fill snap
            out of existence on the way down instead of shrinking, which reads
            as a glitch. */}
        <span
          aria-hidden="true"
          style={{
            height: TRACK_H,
            width: fillWidth(shownIndex),
            opacity: isAuto ? 0 : 1,
            /* Fades out faster than the thumb above it, so it is already gone
               before the thumb starts uncovering the rail. */
            transition: `width ${moveMs}ms ease-out, opacity ${FILL_FADE_MS}ms ease-out`,
          }}
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-green-500"
        />

        {!isAuto &&
          levels.map((value, index) => (
            <span
              key={`stop-${value}`}
              aria-hidden="true"
              style={{ left: centerOf(index) }}
              className={cn(
                'absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors',
                index < activeIndex ? 'bg-white/50' : 'bg-text-secondary/50',
              )}
            />
          ))}

        {/* Auto has no position on the track, so rather than leave an empty rail
            the rail says so outright — otherwise it just looks broken. */}
        {isAuto && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-medium uppercase tracking-wide text-text-secondary"
          >
            {localize('com_ui_auto')}
          </span>
        )}

        {/* Always mounted: unmounting it on the way into Auto pulled the cover off
            the fill mid-fade. It holds still and full-strength until the fill has
            gone, then fades itself. */}
        <span
          aria-hidden="true"
          style={{
            left: centerOf(shownIndex),
            height: thumbSize,
            width: thumbSize,
            opacity: isAuto ? 0 : 1,
            transition: [
              `left ${moveMs}ms ease-out`,
              `height ${moveMs}ms ease-out`,
              `width ${moveMs}ms ease-out`,
              `opacity ${THUMB_FADE_MS}ms ease-out ${isAuto ? `${FILL_FADE_MS}ms` : '0ms'}`,
            ].join(', '),
          }}
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md"
        />

        {levels.map((value, index) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={!isAuto && index === activeIndex}
            aria-label={label(value)}
            onClick={() => select(value)}
            style={{ left: `${(index / levels.length) * 100}%`, width: `${100 / levels.length}%` }}
            className="absolute inset-y-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          />
        ))}
      </div>

      {/* One slot holding both footers: the axis hints belong to the gesture and
          the Thinking row to the resting state, so they crossfade in place
          rather than stacking. Grid keeps the height of the taller of the two. */}
      <div className="mt-1.5 grid">
        <div
          aria-hidden="true"
          className={cn(
            'col-start-1 row-start-1 flex items-center justify-between text-[11px] text-text-secondary transition-opacity duration-150',
            dragging ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <span>{localize('com_ui_composer_effort_faster')}</span>
          <span>{localize('com_ui_composer_effort_smarter')}</span>
        </div>

        <div
          className={cn(
            'col-start-1 row-start-1 flex items-center justify-between gap-2 transition-opacity duration-150',
            dragging ? 'pointer-events-none opacity-0' : 'opacity-100',
          )}
        >
          <span className="text-sm text-text-secondary">
            {localize('com_ui_composer_thinking')}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {/* Only offered as a way back — the button that opened this already
              reads "Auto" while it is active. */}
            {/* Always present, so Auto reads as a mode you turn on and off
                rather than a one-way escape hatch that vanishes once used. */}
            {autoValue != null && (
              <button
                type="button"
                aria-pressed={isAuto}
                onClick={() => select(isAuto ? levels[restoreIndex] : autoValue)}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] transition-colors',
                  isAuto
                    ? 'bg-green-500/15 text-green-500'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                )}
              >
                {localize('com_ui_auto')}
              </button>
            )}
            {descriptionText != null && descriptionText !== '' && (
              <HoverCard openDelay={200}>
                <HoverCardTrigger asChild>
                  <span className="cursor-help text-text-secondary" aria-hidden="true">
                    <CircleHelp className="h-3.5 w-3.5" />
                  </span>
                </HoverCardTrigger>
                <HoverCardPortal>
                  <HoverCardContent side="top" className="w-72 text-sm">
                    {descriptionText}
                  </HoverCardContent>
                </HoverCardPortal>
              </HoverCard>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

export default memo(Effort);
