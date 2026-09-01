import type { TAttachment, TFile } from 'librechat-data-provider';

/** Sources the browser already resolves on its own. */
const ABSOLUTE_SOURCE_PATTERN = /^(?:[a-z][a-z\d+\-.]*:|\/\/)/i;

/**
 * Root-relative paths this app serves itself. One constant because two
 * questions depend on the same answer: which paths need the API base
 * (`toAbsoluteFilePath`), and which markdown sources are already an explicit
 * address rather than a name to look up (`mediaKeyFromSource`). Letting those
 * drift apart is how a source the author addressed exactly gets reduced to its
 * basename and resolved to a different attachment that shares the leaf.
 */
const SERVED_PATH_PATTERN = /^\/(?:images|api)\//i;

/** A line that opens a code fence: up to three spaces of indent, then a run
 *  of three or more backticks or tildes. */
const FENCE_OPEN_LINE = /^ {0,3}(`{3,}|~{3,})/;

/** A line that CLOSES one: the same rules, plus nothing after the run but
 *  whitespace. A fence is not closed by its own delimiter appearing mid-line
 *  inside the code it contains, which is why this is matched per line against
 *  the whole line rather than searched for in the text. */
const FENCE_CLOSE_LINE = /^ {0,3}(`{3,}|~{3,})[ \t\r]*$/;

/**
 * A whole line that is nothing but one image: `![DTI](5_dti.png)`, optionally
 * with an angle-bracketed destination and a title. Anchoring to the entire
 * line with no leading whitespace is what makes this safe to act on — a
 * four-space-indented line is a code block, an escaped `\![` line starts with
 * the backslash, a `> ` line is a quote, and a reference wrapped in backticks
 * has them before the `!`. None of those can match, so none can be claimed.
 *
 * A title must use real delimiters. `![c](c.png unquoted)` is not an image at
 * all — the renderer prints it as text — so accepting arbitrary characters
 * after the destination would claim a file that nothing displayed.
 */
const STANDALONE_IMAGE_LINE =
  /^!\[[^\]\n]*\]\(\s*<?([^)>\s]+)>?(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)\s*$/;

const EMPTY_MEDIA_NAMES: ReadonlySet<string> = new Set<string>();

/** Shared instance so the overwhelmingly common "no attachments" turn keeps a
 *  referentially stable map, and every consumer memoized on it stays put. */
const EMPTY_ATTACHMENTS_BY_NAME: ReadonlyMap<string, TAttachment> = new Map<string, TAttachment>();

/**
 * Lookup key for a filename: the final path segment, lowercased. The backend
 * stores filenames as forward-slash paths regardless of host OS, so the last
 * segment is all a markdown reference and an attachment need to agree on.
 */
function mediaNameKey(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '';
  }
  const slash = trimmed.lastIndexOf('/');
  return (slash < 0 ? trimmed : trimmed.slice(slash + 1)).toLowerCase();
}

function fileKeyOf(attachment: TAttachment): string | undefined {
  const { file_id, filepath } = attachment as Partial<TFile>;
  return file_id ?? filepath;
}

function ownerOf(attachment: TAttachment): {
  toolCallId?: string;
  agentId?: string;
} {
  const owned = attachment as { toolCallId?: string; agentId?: string };
  return { toolCallId: owned.toolCallId, agentId: owned.agentId };
}

/**
 * Stable identity for an attachment: `file_id ?? filepath` scoped by
 * `toolCallId` and `agentId`, else `type:toolCallId` for unkeyed tool
 * artifacts like file_search citations. `undefined` means the row has no
 * stable identity and must never be compared to another — two entries that
 * cannot be told apart are two entries, not one.
 *
 * The ownership dimensions are not decoration. Sibling code calls can share a
 * claimed `file_id` for the same filename and handoff agents can repeat
 * provider tool ids, so `file_id` alone collapses attachments the merge in
 * `useAttachments` deliberately keeps as separate cards — which is why that
 * merge is the caller this lives next to, rather than a second definition.
 */
export function attachmentIdentity(attachment: TAttachment): string | undefined {
  const { type } = attachment as { type?: string };
  const { toolCallId, agentId } = ownerOf(attachment);
  const fileKey = fileKeyOf(attachment);
  if (fileKey) {
    if (toolCallId == null) {
      return fileKey;
    }
    return agentId ? `${fileKey}::${toolCallId}::${agentId}` : `${fileKey}::${toolCallId}`;
  }
  if (type != null && toolCallId != null) {
    return `${type}:${toolCallId}`;
  }
  return undefined;
}

/**
 * Indexes a turn's attachments by the filename a markdown image would name
 * them with.
 *
 * A basename naming more than one STORED FILE is ambiguous and is dropped.
 * Nothing in `![...](output.png)` says which one the author meant, and picking
 * either renders one file under the other's caption — the only outcome worse
 * than not rendering. Dropping the name costs little: the reference renders as
 * it does today, and the media row, which never lost either file, is where
 * both stay visible.
 *
 * Identity is the stored file (`file_id ?? filepath`), not the call that
 * emitted it. One file surfacing under two calls — inherited across steps, or
 * a regeneration that updated the record in place — is one file and still
 * resolves. Two different files are ambiguous no matter who wrote them: an
 * earlier version read a same-author collision as supersession and let the
 * later file win, but a regeneration and two sibling calls that both wrote
 * `output.png` are indistinguishable from the metadata, so that guess could
 * only ever have been right by luck.
 */
export function buildAttachmentsByName(
  attachments: ReadonlyArray<TAttachment> | undefined,
): ReadonlyMap<string, TAttachment> {
  const byName = new Map<string, TAttachment>();
  const ambiguous = new Set<string>();
  for (const attachment of attachments ?? []) {
    if (!attachment?.filepath) {
      continue;
    }
    const key = mediaNameKey(attachment.filename ?? '');
    if (!key || ambiguous.has(key)) {
      continue;
    }
    const claimed = byName.get(key);
    if (claimed == null) {
      byName.set(key, attachment);
    } else if (fileKeyOf(claimed) !== fileKeyOf(attachment)) {
      ambiguous.add(key);
      byName.delete(key);
    }
  }
  return byName.size === 0 ? EMPTY_ATTACHMENTS_BY_NAME : byName;
}

/**
 * Absolute URL for a stored file path.
 *
 * Root-relative paths the app serves itself — `/images/…` uploads and `/api/…`
 * downloads, which is what every code-execution artifact resolves to — must
 * carry the API base or the browser requests them against the origin root and
 * they 404 under a subpath deployment. Shared with `Image` so a rendered
 * attachment and an inline reference to that same attachment cannot disagree
 * about which paths need the prefix.
 */
export function toAbsoluteFilePath(path: string, baseUrl: string): string {
  if (!path || path.startsWith('http') || path.startsWith('data:')) {
    return path;
  }
  return SERVED_PATH_PATTERN.test(path) ? `${baseUrl}${path}` : path;
}

/**
 * Lookup key for a markdown image destination, or `''` when the source is
 * already an address rather than a name — anything carrying a scheme, or a
 * root-relative path this app serves.
 *
 * A scheme is never looked up, `sandbox:` included. react-markdown's default
 * `urlTransform` allows only http/https/irc/mailto/xmpp, so a `sandbox:`
 * source is blanked before the image component ever sees it; treating it as a
 * name here would claim a file the renderer cannot display. Supporting that
 * form needs a `urlTransform` on the markdown pipeline first. The last case matters: an author writing
 * `/api/files/…/chart.png` addressed one specific file, and reducing that to
 * `chart.png` could resolve it to a different attachment sharing the leaf and
 * display the wrong image.
 */
function mediaKeyFromSource(src: string): string {
  if (ABSOLUTE_SOURCE_PATTERN.test(src) || SERVED_PATH_PATTERN.test(src)) {
    return '';
  }
  let decoded = src;
  try {
    decoded = decodeURIComponent(src);
  } catch {
    /* A malformed escape is not a reference we can resolve; match the raw form. */
  }
  return mediaNameKey(decoded.split(/[?#]/, 1)[0]);
}

/**
 * The attachment a markdown image source refers to, or `undefined` when the
 * source is already resolvable or names nothing this turn produced — in which
 * case the caller keeps its existing behavior.
 */
export function resolveInlineMedia(
  src: string | undefined,
  byName: ReadonlyMap<string, TAttachment> | undefined,
): TAttachment | undefined {
  if (!src || byName == null || byName.size === 0) {
    return undefined;
  }
  const key = mediaKeyFromSource(src);
  return key ? byName.get(key) : undefined;
}

/**
 * Filenames the given text certainly renders as images. Used to tell which
 * attachments the reader can already see in place, so a media row does not
 * repeat them.
 *
 * This recognizes ONE shape — an image alone on an unindented line, outside a
 * fence — rather than trying to rule out every context where markdown shows
 * image syntax as text. That inversion is the whole point. Deciding what does
 * NOT render means re-implementing CommonMark (fences of two markers and any
 * length, code spans with variable delimiters, escapes, indented blocks), and
 * every gap in that knowledge claims a file nothing rendered, which drops it
 * from the media row and leaves it visible nowhere at all.
 *
 * Recognizing what certainly DOES render inverts the failure: a shape not
 * matched here is simply not deduped, so it appears in the row as well as
 * inline. The cost of a miss is one duplicate; the cost of a false claim is an
 * invisible file. And the one shape recognized is what models actually write —
 * an image on its own line under a heading.
 *
 * Fence state is tracked across the same single pass rather than pre-stripped,
 * so a fence ends only where markdown ends it — on a line that is nothing but
 * a closing run — and never on its delimiter appearing inside a line of the
 * code it holds. An unterminated fence runs to the end, as the renderer does.
 *
 * `attachmentsByName` must be built from attachments that can actually render
 * as images; a name resolving to a `.csv` produces an `<img>` that shows
 * nothing, and claiming it would take the file's download chip away too.
 */
export function collectInlineMediaNames(text: string | undefined): ReadonlySet<string> {
  if (!text || !text.includes('](')) {
    return EMPTY_MEDIA_NAMES;
  }
  const names = new Set<string>();
  let openFence: string | undefined;
  for (const line of text.split('\n')) {
    if (openFence != null) {
      const closer = FENCE_CLOSE_LINE.exec(line)?.[1];
      if (closer != null && closer[0] === openFence[0] && closer.length >= openFence.length) {
        openFence = undefined;
      }
      continue;
    }
    const opener = FENCE_OPEN_LINE.exec(line)?.[1];
    if (opener != null) {
      openFence = opener;
      continue;
    }
    const key = mediaKeyFromSource(STANDALONE_IMAGE_LINE.exec(line)?.[1] ?? '');
    if (key) {
      names.add(key);
    }
  }
  return names.size === 0 ? EMPTY_MEDIA_NAMES : names;
}
