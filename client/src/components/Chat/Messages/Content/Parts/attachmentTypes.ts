import { imageExtRegex } from 'librechat-data-provider';
import type { TAttachment, TAttachmentMetadata, TFile } from 'librechat-data-provider';
import type { ToolArtifactType } from '~/utils/artifacts';
import { detectArtifactTypeFromFile } from '~/utils/artifacts';

/**
 * Empty-folder placeholders the bash executor drops in the stateless
 * sandbox so a `mkdir` survives across runs. The user has no reason to
 * see these — they're an implementation detail of `@librechat/agents`
 * — so we filter them out before any UI rendering.
 *
 * Anchored to the *post-sanitization* form `_.dirkeep-<6 hex>` /
 * `_.gitkeep-<6 hex>` produced by `sanitizeArtifactPath` (the leading
 * `.` is always rewritten to `_` and a disambiguator is always
 * appended because the dotfile rewrite counts as a mutation). A bare
 * `.dirkeep` / `.gitkeep` never originates from the sandbox — it's
 * almost always project scaffolding the user uploaded — so the
 * underscore prefix and the hex suffix are the discriminating signal.
 */
const SANDBOX_PLACEHOLDER_LEAVES = /^_\.(?:dirkeep|gitkeep)-[0-9a-f]{6}$/i;

/**
 * Two complementary patterns recover the user-visible filename from the
 * backend's sanitized form. Splitting them avoids the false-positive
 * where a legitimate filename happens to end in `-` + 6 hex chars:
 *
 *   - `COLLISION_SUFFIX_BEFORE_EXT` matches the suffix only when an
 *     extension follows (`output-deadbe.csv` → `output.csv`). This is
 *     the broad case from `embedDisambiguatorInLeaf` for non-dotfiles
 *     where sanitization mutated something (spaces, special chars).
 *
 *   - `SANITIZED_DOTFILE_TRAILING_SUFFIX` matches only when the leaf
 *     starts with `_.` AND ends with `-XXXXXX`. That combination is
 *     the unambiguous fingerprint of `sanitizeArtifactPath`'s dotfile
 *     rewrite (`.dirkeep` → `_.dirkeep-88b30b`). Without this anchor,
 *     a user-named `build-a1b2c3` would lose its `-a1b2c3` suffix
 *     because there's no way to tell intent from a hex-shaped tail
 *     alone.
 */
const COLLISION_SUFFIX_BEFORE_EXT = /-[0-9a-f]{6}(?=\.[^.]+$)/;
const SANITIZED_DOTFILE_TRAILING_SUFFIX = /^(_\..+)-[0-9a-f]{6}$/;

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
 *
 * `bytes` must be *explicitly* zero to qualify — `undefined` means
 * "size unknown" (web-search results, archived attachments where the
 * schema omits the byte count) and we render those normally rather
 * than hiding them on a name match alone.
 */
export const isInternalSandboxArtifact = (attachment: TAttachment): boolean => {
  const file = attachment as TFile & TAttachmentMetadata;
  if (file.bytes !== 0) {
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
  // Try the broad case first (suffix before an extension). If nothing
  // matched, fall back to the dotfile-specific anchor so we don't strip
  // a 6-hex tail off an extensionless leaf the user actually named that
  // way (e.g. `build-a1b2c3` from a hash-named build artifact).
  let cleanedLeaf = leaf.replace(COLLISION_SUFFIX_BEFORE_EXT, '');
  if (cleanedLeaf === leaf) {
    const dotfileMatch = leaf.match(SANITIZED_DOTFILE_TRAILING_SUFFIX);
    if (dotfileMatch) {
      cleanedLeaf = dotfileMatch[1];
    }
  }
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
 * normal entries (renders first), `1` only for entries that explicitly
 * report `bytes === 0` (empty placeholders — sink to the bottom).
 *
 * Treating an absent `bytes` field as neutral (`0`) keeps non-code-exec
 * sources (web-search inline results, uploaded files where the schema
 * omits the byte count) from silently sinking past real content. The
 * filter is intentionally narrow: only an explicit zero counts as empty.
 *
 * The internal cast targets the `TFile & TAttachmentMetadata` arm of
 * `TAttachment` (the only one that declares `bytes`) rather than an
 * anonymous `{ bytes?: number }` shape. Tying the cast to the concrete
 * source type means a future `bytes` retype on `TFile` (e.g., to
 * `bigint`) would surface here at compile time instead of being
 * silently papered over.
 */
export const attachmentSalience = (item: TAttachment): number => {
  const bytes = (item as TFile & TAttachmentMetadata).bytes;
  return bytes === 0 ? 1 : 0;
};

/**
 * Stable comparator for arrays of `TAttachment` values. Equivalent to
 * `(a, b) => attachmentSalience(a) - attachmentSalience(b)` but
 * exported once so the lambda doesn't need to be repeated at every
 * call site.
 */
export const bySalience = (a: TAttachment, b: TAttachment): number =>
  attachmentSalience(a) - attachmentSalience(b);

/**
 * Comparator variant for buckets that wrap the attachment in a record
 * (e.g. `{ attachment, type }` panel entries). Reads salience off the
 * inner `attachment` field so wrapped buckets sort the same way the
 * bare ones do.
 */
export const byEntrySalience = <T extends { attachment: TAttachment }>(a: T, b: T): number =>
  attachmentSalience(a.attachment) - attachmentSalience(b.attachment);

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
