const OPEN_MARKER = '[DOCUMENT]';
const CLOSE_MARKER = '[/DOCUMENT]';

/**
 * Stream-aware filter for `[DOCUMENT]...[/DOCUMENT]` blocks emitted by Claude
 * in response to teacher requests. The block's content is markdown that we
 * convert server-side into a .docx and attach to the assistant message;
 * the user should never see the raw markers in the streamed output.
 *
 * Behaviour:
 *  - Feed text deltas as they arrive via `feed(delta)`. Returns the slice
 *    that is safe to forward to the user (markers and inside-block content
 *    stripped).
 *  - The filter holds back any partial-marker suffix at the end of a delta
 *    (e.g. "[DOC") so we don't accidentally emit a half-marker before the
 *    next delta confirms it's actually inside a block.
 *  - Inside a block, content is accumulated in `currentDoc`.
 *  - On `[/DOCUMENT]`, the accumulated content is pushed onto `documents`
 *    and the filter returns to outside-block state.
 *  - `finalize()` flushes any held buffer and returns trailing text plus
 *    the captured document list. If the stream ended mid-block, the
 *    partial content is still captured (better to attach a malformed file
 *    than lose user content).
 *
 * Markers are treated case-insensitively. We normalize against the
 * canonical uppercase form so `[Document]`, `[DOCUMENT]`, `[document]`
 * all work.
 */
class DocBlockFilter {
  constructor() {
    /** @type {string} buffered text that hasn't been emitted yet */
    this.buffer = '';
    /** @type {boolean} */
    this.inDocument = false;
    /** @type {string} content accumulated for the in-progress document */
    this.currentDoc = '';
    /** @type {string[]} completed documents extracted from the stream */
    this.documents = [];
  }

  /**
   * Feed a delta of streamed text. Returns the portion that should be
   * forwarded to the user (may be empty if we're inside a block or if the
   * filter is holding a partial marker awaiting more deltas).
   * @param {string} delta
   * @returns {string}
   */
  feed(delta) {
    if (typeof delta !== 'string' || delta.length === 0) {
      return '';
    }
    this.buffer += delta;
    return this._drain();
  }

  /**
   * Call once the stream has completed. Flushes any remaining buffered
   * text and finalizes any in-progress document.
   * @returns {{ trailingText: string, documents: string[] }}
   */
  finalize() {
    let trailingText = '';
    if (this.inDocument) {
      /* Stream ended mid-document. Treat the partial content as a complete
       * doc — we'd rather attach a slightly truncated file than silently
       * drop the user's content. */
      this.documents.push(this.currentDoc);
      this.currentDoc = '';
      this.inDocument = false;
      this.buffer = '';
    } else if (this.buffer.length > 0) {
      /* Any held lookahead buffer at this point is not a marker — emit. */
      trailingText = this.buffer;
      this.buffer = '';
    }
    return { trailingText, documents: this.documents.slice() };
  }

  /* ------- internals ------- */

  _drain() {
    let toEmit = '';

    while (this.buffer.length > 0) {
      if (this.inDocument) {
        const closeIdx = this._findMarker(this.buffer, CLOSE_MARKER);
        if (closeIdx !== -1) {
          this.currentDoc += this.buffer.slice(0, closeIdx);
          this.documents.push(this.currentDoc);
          this.currentDoc = '';
          this.inDocument = false;
          this.buffer = this.buffer.slice(closeIdx + CLOSE_MARKER.length);
          continue;
        }
        const partial = this._partialMarkerLength(this.buffer, CLOSE_MARKER);
        if (partial > 0) {
          this.currentDoc += this.buffer.slice(0, this.buffer.length - partial);
          this.buffer = this.buffer.slice(this.buffer.length - partial);
        } else {
          this.currentDoc += this.buffer;
          this.buffer = '';
        }
        break;
      } else {
        const openIdx = this._findMarker(this.buffer, OPEN_MARKER);
        if (openIdx !== -1) {
          toEmit += this.buffer.slice(0, openIdx);
          this.buffer = this.buffer.slice(openIdx + OPEN_MARKER.length);
          this.inDocument = true;
          continue;
        }
        const partial = this._partialMarkerLength(this.buffer, OPEN_MARKER);
        if (partial > 0) {
          toEmit += this.buffer.slice(0, this.buffer.length - partial);
          this.buffer = this.buffer.slice(this.buffer.length - partial);
        } else {
          toEmit += this.buffer;
          this.buffer = '';
        }
        break;
      }
    }

    return toEmit;
  }

  /**
   * Case-insensitive indexOf for a marker, returning the position of the
   * first match or -1.
   */
  _findMarker(text, marker) {
    return text.toUpperCase().indexOf(marker);
  }

  /**
   * Returns the length of the longest suffix of `text` that is a prefix of
   * `marker` (case-insensitive). Used to decide how many trailing chars to
   * hold in the buffer awaiting more deltas.
   */
  _partialMarkerLength(text, marker) {
    const upperText = text.toUpperCase();
    const max = Math.min(upperText.length, marker.length - 1);
    for (let i = max; i > 0; i--) {
      if (upperText.endsWith(marker.slice(0, i))) {
        return i;
      }
    }
    return 0;
  }
}

/**
 * Convenience: extract all `[DOCUMENT]...[/DOCUMENT]` blocks from a
 * complete (non-streaming) text. Used as a defensive fallback in case
 * stream-time filtering missed something.
 *
 * @param {string} text
 * @returns {{ documents: string[], strippedText: string }}
 */
function extractDocumentBlocks(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { documents: [], strippedText: text ?? '' };
  }
  const filter = new DocBlockFilter();
  let stripped = filter.feed(text);
  const { trailingText, documents } = filter.finalize();
  stripped += trailingText;
  return { documents, strippedText: stripped };
}

module.exports = {
  DocBlockFilter,
  extractDocumentBlocks,
  OPEN_MARKER,
  CLOSE_MARKER,
};
