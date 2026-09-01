import { appendLeafSuffix, flattenArtifactPath, FILENAME_SEGMENT_MAX_BYTES } from '~/utils/files';

/**
 * Sandbox input files mount at a destination derived from their `name`, and
 * codeapi rejects the whole `/exec` request when two entries resolve to the
 * same destination — or when one destination is a directory prefix of
 * another (`files contains duplicate destination "x"`, `files contains
 * conflicting destinations "a" and "a/b"`). A rejection is fatal for the
 * rest of the conversation: the request never reaches the sandbox, so no
 * result comes back to collapse the colliding refs, and every later turn
 * re-primes the same pair.
 *
 * Nothing about a LibreChat file record guarantees that uniqueness. Only
 * code-generated outputs are covered by the `(filename, conversationId,
 * context, tenantId)` partial unique index; user uploads carry
 * `context: message_attachment`, so one conversation can hold several
 * records sharing a `filename` — two uploads of `image.png`, or an upload
 * whose name a later execution wrote back in place.
 *
 * This module owns the name → destination mapping so every contributor to
 * an `/exec` file list agrees on it.
 */
export interface CodeDestinationSet {
  readonly names: Set<string>;
  readonly ancestors: Set<string>;
}

export function createCodeDestinationSet(): CodeDestinationSet {
  return { names: new Set<string>(), ancestors: new Set<string>() };
}

function collectAncestors(destination: string): string[] {
  const segments = destination.split('/');
  const ancestors: string[] = [];
  for (let i = 1; i < segments.length; i++) {
    ancestors.push(segments.slice(0, i).join('/'));
  }
  return ancestors;
}

/** True when a claimed file sits at one of `destination`'s parent
 *  directories, so every name under that directory conflicts. */
function hasTakenAncestor(set: CodeDestinationSet, destination: string): boolean {
  const ancestors = collectAncestors(destination);
  for (let i = 0; i < ancestors.length; i++) {
    if (set.names.has(ancestors[i])) {
      return true;
    }
  }
  return false;
}

/** Mirrors codeapi's `validateExecuteFiles` conflict rule: an exact match, or
 *  either destination being a directory prefix of the other. */
function isTaken(set: CodeDestinationSet, destination: string): boolean {
  if (set.names.has(destination) || set.ancestors.has(destination)) {
    return true;
  }
  return hasTakenAncestor(set, destination);
}

function take(set: CodeDestinationSet, destination: string): void {
  set.names.add(destination);
  const ancestors = collectAncestors(destination);
  for (let i = 0; i < ancestors.length; i++) {
    set.ancestors.add(ancestors[i]);
  }
}

/**
 * Inserts `-n` before the leaf's extension, preserving directory structure
 * (`a/b/c.txt` -> `a/b/c-2.txt`). The leaf is held to the same per-segment
 * byte budget `sanitizeFilename` applies, since codeapi caps whole-path
 * length and a name already sitting at the cap would otherwise grow past it.
 * The counter survives that trim, so distinct counters stay distinct and the
 * search below always terminates.
 */
function withCounter(destination: string, counter: number): string {
  const slash = destination.lastIndexOf('/');
  const dir = slash === -1 ? '' : destination.slice(0, slash + 1);
  const leaf = destination.slice(slash + 1);
  return `${dir}${appendLeafSuffix(leaf, `-${counter}`, FILENAME_SEGMENT_MAX_BYTES)}`;
}

/**
 * Claims a destination for `name`, disambiguating with a `-2`, `-3`, ...
 * counter when it is already spoken for. Callers that own what the model is
 * told about the sandbox use this: both files stay reachable, at names the
 * caller can echo into the tool context.
 *
 * Deterministic for a given claim order, so callers must claim in a stable
 * order — see {@link sortCodeFilesByDestinationPriority}. Names beyond the
 * first collision on a shared stem can still shift as the colliding set
 * grows; that is inherent to mounting by name, and only the already
 * degenerate three-way case reaches it.
 */
export function claimCodeDestination(set: CodeDestinationSet, name: string): string {
  /* A claimed file sitting at a parent directory makes every name beneath it
   * conflict, so bumping the leaf can never clear it. Flattening lifts the
   * path out from under that directory and leaves only whole-name conflicts,
   * which the counter does clear. */
  const base = hasTakenAncestor(set, name)
    ? flattenArtifactPath(name, FILENAME_SEGMENT_MAX_BYTES)
    : name;
  let destination = base;
  for (let counter = 2; isTaken(set, destination); counter++) {
    destination = withCounter(base, counter);
  }
  take(set, destination);
  return destination;
}

/**
 * Reserves `name` only if it is free, reporting whether the caller may keep
 * the file. Merge points use this rather than {@link claimCodeDestination}:
 * a renamed destination there would be one the model was never told about,
 * and a conflict at that layer means the same logical file arrived twice
 * under different storage pointers, so dropping the later copy loses
 * nothing.
 */
export function reserveCodeDestination(set: CodeDestinationSet, name: string): boolean {
  if (isTaken(set, name)) {
    return false;
  }
  take(set, name);
  return true;
}

interface CodeDestinationCandidate {
  file_id?: string;
  createdAt?: Date | string | number;
}

function toTime(value: Date | string | number | undefined): number {
  if (value == null) {
    return 0;
  }
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Orders files so the newest record claims the bare name and older ones take
 * the counter. Newest-wins matches `ToolNode.updateCodeSession`, which
 * collapses by name the same way once results come back, and it is the right
 * answer when an execution rewrote an uploaded file in place: the model's
 * next read of that path gets its own edit, not the superseded original.
 *
 * Ordering is keyed on `createdAt` because it never moves. `updatedAt` — the
 * default `getFiles` sort — is bumped by usage accounting and by re-upload,
 * so destinations keyed on it would shuffle between turns and silently
 * repoint paths that code written in an earlier turn still reads.
 *
 * Holes are tolerated and preserved rather than filtered: callers hand this
 * a raw query result and keep their own per-entry guard.
 */
export function sortCodeFilesByDestinationPriority<T extends CodeDestinationCandidate>(
  files: Array<T | null | undefined>,
): Array<T | null | undefined> {
  return [...files].sort((a, b) => {
    const delta = toTime(b?.createdAt) - toTime(a?.createdAt);
    if (delta !== 0) {
      return delta;
    }
    return (a?.file_id ?? '').localeCompare(b?.file_id ?? '');
  });
}
