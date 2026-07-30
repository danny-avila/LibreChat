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
 * Set while an "Interrupt now" escalation is awaiting its reclaim round-trip.
 * In that window no preempt chip exists yet, so the chip-derived
 * single-interrupt gate cannot see the escalation; every other escalation
 * control disables on this instead of racing the same seal.
 */
export const escalatingSteerFamily = atomFamily((_conversationId: string) => atom<boolean>(false));
