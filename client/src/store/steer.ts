import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

/**
 * Measured pixel height of the in-flight steer overlay for a conversation.
 * The overlay floats above the composer over the bottom of the message scroll
 * area; the messages reserve an equal band of bottom padding (see
 * `MessagesView`) so the newest message clears it at rest and older messages
 * scroll behind it. `InFlightSteers` publishes its height here and resets it to
 * 0 on unmount, so the entry is never stale — the atomFamily is not GC'd, but
 * each holds a single number per visited conversation.
 */
export const steerOverlayHeightFamily = atomFamily((_conversationId: string) => atom<number>(0));

/**
 * Set synchronously before a bubble's arm request and cleared on settlement.
 * Purely a UX gate: with the atomic in-place arm, a double-arm is harmless
 * server-side (the run seals once and drains the whole queue in order), but
 * every escalation control advertises "one interrupt at a time" by disabling,
 * and the chip-derived check cannot see an arm until its response lands.
 */
export const escalatingSteerFamily = atomFamily((_conversationId: string) => atom<boolean>(false));

/**
 * Whether the queued-message outbox is expanded, per queue key (so a brand-new
 * chat and its resolved id are distinct, matching `useSteering.queueKey`).
 * Collapsed by default and deliberately in memory only: the queue itself does
 * not survive a reload, so persisting the disclosure would outlive its subject.
 */
export const queueExpandedFamily = atomFamily((_queueKey: string) => atom<boolean>(false));

/**
 * Id of the queued row whose inline editor is currently empty, if any. The
 * write-through refuses blank text, so that row still holds words the user has
 * visibly deleted and nothing may send it. The row owns its editor state but
 * the group owns the shortcut proxy, so the fact has to live where both can
 * see it. At most one editor is open at a time — opening another blurs the
 * first — so a single id is enough.
 */
export const queueEmptyEditFamily = atomFamily((_queueKey: string) => atom<string | null>(null));
