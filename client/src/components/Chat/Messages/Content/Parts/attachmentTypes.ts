import { imageExtRegex } from 'librechat-data-provider';
import type { TAttachment, TAttachmentMetadata, TFile } from 'librechat-data-provider';
import type { ToolArtifactType } from '~/utils/artifacts';
import { detectArtifactTypeFromFile } from '~/utils/artifacts';

/**
 * Names the code-execution sandbox uses for empty-folder placeholders so
 * directory structure survives a `mkdir` in the stateless container.
 * The user has no reason to see these — they're an implementation detail
 * of `@librechat/agents`'s bash executor — so we filter them out before
 * any UI rendering. Match against the leaf segment so a real path like
 * `notes/.dirkeep.md` (unlikely but possible) isn't accidentally hidden.
 *
 * Names appear post-sanitization (`packages/api/src/utils/files.ts`):
 * a leading `.` is rewritten to `_` and a 6-hex disambiguator is
 * appended when sanitization mutated the input (`.dirkeep` →
 * `_.dirkeep-<hash>`), so the regex tolerates both forms and the
 * optional suffix.
 */
const SANDBOX_PLACEHOLDER_LEAVES = /^_?\.(?:dirkeep|gitkeep)(?:-[0-9a-f]{6})?$/i;

/**
 * Drop the deterministic 6-hex disambiguator the backend appends when
 * sanitization mutated the raw filename (e.g. `.dirkeep` → `_.dirkeep-88b30b`,
 * `out 1.csv` → `out_1-<hash>.csv`). The hash is collision-avoidance
 * machinery; users only need to see a recognizable name. We strip it
 * for display *only* — the on-disk filename keeps the suffix so
 * downloads still resolve.
 */
const COLLISION_SUFFIX = /-[0-9a-f]{6}(?=\.[^.]+$|$)/;

/**
 * Last segment of a forward-slash path. The backend stores filenames as
 * forward-slash paths regardless of host OS, so we don't need full
 * `path.basename` here — just the final segment.
 */
const leafOf = (filename: string | undefined): string => {
  const raw = filename ?? '';
  const slash = raw.lastIndexOf('/');
  return slash < 0 ? raw : raw.slice(slash + 1);
};

/**
 * `true` when the attachment is a sandbox-internal placeholder (empty
 * folder marker) the user shouldn't see as its own file chip.
 */
export const isInternalSandboxArtifact = (attachment: TAttachment): boolean => {
  const file = attachment as TFile & TAttachmentMetadata;
  if ((file.bytes ?? 0) > 0) {
    return false;
  }
  return SANDBOX_PLACEHOLDER_LEAVES.test(leafOf(attachment.filename));
};

/**
 * Display-only filename. Strips the collision-disambiguator suffix the
 * backend embeds in the on-disk name. The original `attachment.filename`
 * stays intact for download/lookup; this just relabels what the user
 * reads in the chip.
 */
export const displayFilename = (filename: string | undefined): string => {
  const raw = filename ?? '';
  if (!raw) {
    return raw;
  }
  const slash = raw.lastIndexOf('/');
  const dir = slash < 0 ? '' : raw.slice(0, slash);
  const leaf = slash < 0 ? raw : raw.slice(slash + 1);
  const cleanedLeaf = leaf.replace(COLLISION_SUFFIX, '');
  // Drop the leading-dotfile underscore prefix (`_.dirkeep` → `.dirkeep`)
  // only when paired with the collision suffix, since that combination is
  // a strong signal the underscore was added by sanitization. Standalone
  // underscored names are left alone — a user-named `_foo.txt` is real.
  const restoredLeaf =
    cleanedLeaf !== leaf && cleanedLeaf.startsWith('_.') ? cleanedLeaf.slice(1) : cleanedLeaf;
  return dir ? `${dir}/${restoredLeaf}` : restoredLeaf;
};

/**
 * Salience weight for sorting attachments within a bucket. `0` for
 * non-empty content (renders first), `1` for empty / placeholder
 * (sinks to the bottom). Single-arg so callers compose it inline as
 * `arr.sort((a, b) => attachmentSalience(a) - attachmentSalience(b))` —
 * a two-arg comparator hits TypeScript's contravariance check on
 * `TAttachment`'s union branches that don't carry `bytes`.
 *
 * Accepts the broad `TAttachment` union (some branches lack `bytes`)
 * plus the bare `{ bytes?: number }` shape the unit tests use. The
 * `bytes` read goes through a defensive cast since not every branch
 * declares the property.
 */
export const attachmentSalience = (item: TAttachment | { bytes?: number }): number => {
  const bytes = (item as { bytes?: number }).bytes ?? 0;
  return bytes > 0 ? 0 : 1;
};

/**
 * An attachment is treated as an image only when it has the dimensions and
 * filepath needed to render via `<Image>`. Without width/height the image
 * cannot reserve layout space, so we fall back to the file card.
 */
export const isImageAttachment = (attachment: TAttachment): boolean => {
  if (!attachment.filename) {
    return false;
  }
  const { width, height, filepath = null } = attachment as TFile & TAttachmentMetadata;
  return (
    imageExtRegex.test(attachment.filename) && width != null && height != null && filepath != null
  );
};

/**
 * An attachment renders inline as text when the backend has populated a
 * non-empty `text` field on the underlying file record. Empty strings are
 * treated as "no inline text available" and fall through to the download UI.
 */
export const isTextAttachment = (attachment: TAttachment): boolean => {
  const { text } = attachment as TFile & TAttachmentMetadata;
  return typeof text === 'string' && text.length > 0;
};

/**
 * The artifact MIME type a tool-output attachment maps to, or `null` if
 * we don't have a viewer for it. Layered on `detectArtifactTypeFromFile`
 * so the routing logic stays in one place; classifying happens here so
 * the message-render code reads cleanly.
 */
export const artifactTypeForAttachment = (attachment: TAttachment): ToolArtifactType | null => {
  const file = attachment as TFile & TAttachmentMetadata;
  return detectArtifactTypeFromFile(file);
};

/**
 * Per-rendered-occurrence React key for an attachment. The `file_id`
 * provides stability across re-renders for the common case (each tool
 * call's output has unique file ids), and the index suffix disambiguates
 * the rare case where the same `file_id` appears twice in one bucket
 * (e.g. a tool call writing the same path twice). Without the suffix the
 * duplicates would share a key and React would reconcile them as a single
 * child — undermining the latest-mention dedup since the two cards would
 * share an instance instead of contesting the claim.
 */
export const renderAttachmentKey = (
  prefix: string,
  attachment: TAttachment,
  index: number,
): string => {
  const fileId = (attachment as TFile & TAttachmentMetadata).file_id;
  return `${prefix}-${fileId ?? 'noid'}-${index}`;
};
