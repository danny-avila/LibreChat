import { forwardRef, useState } from 'react';
import type {
  ForwardRefExoticComponent,
  KeyboardEvent,
  ReactNode,
  Ref,
  RefAttributes,
} from 'react';
import { composerSurfaceClasses, composerSurfaceShadow } from '~/utils/composer';
import { TextareaAutosize } from './TextareaAutosize';
import { TooltipAnchor } from './Tooltip';
import { SendIcon } from '~/svgs';
import { cn } from '~/utils';

/** What a key press means to the composer. Mirrors the main chat form's own
 *  verdicts: `block` is "swallow it, do nothing", `newline` and `none` both
 *  leave the key to the field. */
export type ComposerKeyVerdict = 'submit' | 'block' | 'newline' | 'none';

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Blocks submission without disabling the field, so a reader can still type
   *  and read back a draft the surface is not ready to accept. */
  canSubmit: boolean;
  submitLabel: string;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  minRows?: number;
  maxRows?: number;
  /** Secondary controls, laid out inline-start of the send button. */
  actions?: ReactNode;
  /**
   * The reader's "Press Enter to send" preference. When false, Enter inserts a
   * newline and ⌘/Ctrl+Enter submits — the same bargain the main chat composer
   * strikes, so a reader who turned the preference off cannot steer a run or
   * leave for a continued chat by reaching for a line break.
   */
  submitOnEnter?: boolean;
  /**
   * The host's own key policy, so a reader who rebound (or unbound) the submit
   * shortcut gets the same contract they get in the main chat form, and chords
   * claimed by global shortcuts are left for the window handler. Given the
   * event and whether an IME is mid-composition. Without it, `submitOnEnter`
   * drives a plain Enter / ⌘-Ctrl+Enter contract.
   */
  resolveKeyVerdict?: (
    event: KeyboardEvent<HTMLTextAreaElement>,
    isComposing: boolean,
  ) => ComposerKeyVerdict;
  className?: string;
}

/**
 * The chat composer at panel scale: one persistent surface with a text field, a
 * stable action row, and the same send affordance the main chat form uses.
 *
 * It is deliberately state-free. Every surface that hosts a conversation beside
 * the main thread (a subagent thread, a side chat) owns what Enter means for it
 * and passes that in as `onSubmit`, so the affordance never has to be swapped
 * out for a different control when a run settles — which is what makes the
 * footer shift under the reader.
 */
const Composer: ForwardRefExoticComponent<ComposerProps & RefAttributes<HTMLTextAreaElement>> =
  forwardRef(function Composer(
    {
      value,
      onChange,
      onSubmit,
      canSubmit,
      submitLabel,
      ariaLabel,
      placeholder,
      disabled = false,
      maxLength,
      minRows = 1,
      maxRows = 6,
      actions,
      submitOnEnter = true,
      resolveKeyVerdict,
      className,
    }: ComposerProps,
    ref: Ref<HTMLTextAreaElement>,
  ) {
    const [isComposing, setIsComposing] = useState(false);

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      /**
       * `isComposing` alone does not settle the IME question: Safari reports it
       * as false on the very Enter that commits a candidate, so the tracked
       * composition state and the legacy `Process`/229 signals stand in for it,
       * as the main chat composer's own guard does. Committed here rather than
       * left to the host so every caller inherits it.
       */
      const composing =
        isComposing ||
        event.nativeEvent.isComposing ||
        event.key === 'Process' ||
        event.keyCode === 229;

      const defaultVerdict = (): ComposerKeyVerdict => {
        if (composing || event.key !== 'Enter' || event.shiftKey) return 'none';
        if (!submitOnEnter && !(event.metaKey || event.ctrlKey)) return 'newline';
        return 'submit';
      };

      const verdict = resolveKeyVerdict?.(event, composing) ?? defaultVerdict();
      if (verdict === 'newline' || verdict === 'none') return;
      event.preventDefault();
      /** An empty field never submits, even where the surface would accept it:
       *  a caller whose action needs no text (continuing a settled thread)
       *  still wants that to be a deliberate press of the button, not a stray
       *  Enter that navigates the reader somewhere. */
      if (verdict === 'block' || !canSubmit || value.trim() === '') return;
      onSubmit();
    };

    return (
      <div
        className={cn(
          'flex w-full flex-col gap-1.5 rounded-3xl p-2.5',
          composerSurfaceClasses(),
          composerSurfaceShadow.within,
          className,
        )}
      >
        <TextareaAutosize
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          maxLength={maxLength}
          minRows={minRows}
          maxRows={maxRows}
          disabled={disabled}
          className="w-full resize-none bg-transparent px-1.5 py-1 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none disabled:cursor-not-allowed"
        />
        {/* The row holds its height whether or not it carries secondary actions,
          so the surface cannot resize as a run changes what it offers. */}
        <div className="flex min-h-9 flex-wrap items-center gap-1.5">
          {actions}
          <TooltipAnchor
            description={submitLabel}
            className="ml-auto"
            render={
              <button
                type="button"
                aria-label={submitLabel}
                disabled={disabled || !canSubmit}
                onClick={onSubmit}
                data-testid="composer-send-button"
                className="size-theme-control rounded-theme-control-round bg-text-primary p-theme-compact text-text-primary outline-offset-4 transition-all duration-theme-normal disabled:cursor-not-allowed disabled:text-text-secondary disabled:opacity-10"
              >
                <SendIcon size={24} />
              </button>
            }
          />
        </div>
      </div>
    );
  });

export default Composer;
