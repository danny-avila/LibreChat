import type { TStartupConfig } from './config';

/**
 * The startup-config field that puts a footer bar beneath a conversation's
 * composer. Narrow on purpose: the server answers the same question while it
 * serves the HTML shell, reading this field off its own configuration instead
 * of assembling a startup payload it has no request for.
 */
export type TConfiguredFooterSource = Pick<Partial<TStartupConfig>, 'customFooter'>;

/**
 * Whether a deployment configured footer content of its own.
 *
 * Only the custom footer counts. A privacy policy and terms of service are read
 * where they are agreed to, at registration, and on the welcome screen the
 * conversation starts from; a started conversation carries neither, so neither
 * one puts a bar beneath its composer.
 *
 * The footer bar is absolutely positioned in a zero-height wrapper, so the
 * composer above it is what reserves its band: this answer decides both the
 * bar and the clearance. The client and the server share it because the two
 * answering differently is exactly the layout correction it exists to remove.
 */
export function hasConfiguredFooter(source?: TConfiguredFooterSource | null): boolean {
  return typeof source?.customFooter === 'string';
}
