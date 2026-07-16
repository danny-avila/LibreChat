const FENCE = '```';

export const CODE_POINTER = "I've put the code in the chat.";
export const TABLE_POINTER = "I've put the table in the chat.";
export const IMAGE_POINTER = "I've put the image in the chat.";

const IMAGE_PATTERN = /!\[[^\]]*\]\([^)]*\)/g;
const LINK_PATTERN = /\[([^\]]*)\]\([^)]*\)/g;
const TABLE_ROW = /^\s*\|.*\|\s*$/;

/**
 * Rewrites an assistant answer into something worth hearing.
 *
 * Text chat's response space is strictly richer than audio's: a fenced code block read
 * aloud is unusable, and silently dropping it leaves the caller with an answer full of
 * holes. So non-speech content is replaced by a short spoken pointer while the rich
 * original still lands in the persisted message, on screen.
 *
 * This is deliberately a transform rather than a system prompt: the worker carries no
 * prompt, and instructing the agent to "answer conversationally" would change what gets
 * persisted for text readers too.
 *
 * Operates line-by-line and holds an incomplete trailing line, because a fence marker
 * routinely straddles two LLM deltas.
 */
export class SpeechFilter {
  private buffer = '';
  private inFence = false;
  private inTable = false;
  private announcedFence = false;
  private announcedTable = false;
  private sourceLength = 0;
  /** Total speech emitted so far; compared against playback to detect a barge-in. */
  spokenLength = 0;
  /**
   * Maps spoken offsets back to source offsets, recorded per line. Barge-in needs this:
   * LiveKit knows how much *speech* played, but the persisted message is the original
   * markdown, and the spoken form is a rewrite of it rather than a prefix.
   */
  private checkpoints: Array<{ spoken: number; source: number }> = [{ spoken: 0, source: 0 }];

  push(chunk: string): string {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    let emitted = '';
    for (const line of lines) {
      const spoken = this.consumeLine(line);
      this.sourceLength += line.length + 1;
      this.spokenLength += spoken.length;
      this.checkpoints.push({ spoken: this.spokenLength, source: this.sourceLength });
      emitted += spoken;
    }
    return emitted;
  }

  /**
   * Largest source offset fully covered by `spokenCharacters`. Line-granular, and rounds
   * *down* on purpose: persisting slightly less than was heard is recoverable, persisting
   * words the caller never heard is not.
   */
  sourceOffsetFor(spokenCharacters: number): number {
    let source = 0;
    for (const checkpoint of this.checkpoints) {
      if (checkpoint.spoken > spokenCharacters) {
        break;
      }
      source = checkpoint.source;
    }
    return source;
  }

  /** Emits whatever is held back, so a reply with no trailing newline is still spoken. */
  flush(): string {
    const remaining = this.buffer;
    this.buffer = '';
    if (remaining.length === 0) {
      return '';
    }
    return this.consumeLine(remaining, false);
  }

  private consumeLine(line: string, withNewline = true): string {
    if (line.trimStart().startsWith(FENCE)) {
      this.inFence = !this.inFence;
      if (this.inFence && !this.announcedFence) {
        this.announcedFence = true;
        return `${CODE_POINTER} `;
      }
      return '';
    }

    if (this.inFence) {
      return '';
    }

    if (TABLE_ROW.test(line)) {
      this.inTable = true;
      if (!this.announcedTable) {
        this.announcedTable = true;
        return `${TABLE_POINTER} `;
      }
      return '';
    }
    this.inTable = false;

    const spoken = this.toSpeech(line);
    if (spoken.trim().length === 0) {
      return '';
    }
    return withNewline ? `${spoken}\n` : spoken;
  }

  private toSpeech(line: string): string {
    return line
      .replace(IMAGE_PATTERN, ` ${IMAGE_POINTER} `)
      .replace(LINK_PATTERN, '$1')
      .replace(/[*_`#>]/g, '')
      .replace(/\s+/g, ' ')
      .trimEnd();
  }
}
