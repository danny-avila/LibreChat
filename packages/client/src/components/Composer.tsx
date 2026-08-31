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
      className,
    }: ComposerProps,
    ref: Ref<HTMLTextAreaElement>,
  ) {
    const [isComposing, setIsComposing] = useState(false);

    /**
     * Four separate reasons not to submit on an Enter:
     *
     * - An IME candidate is being committed. `isComposing` alone is not enough:
     *   Safari reports it as false on the very Enter that commits, so the
     *   tracked composition state and the legacy `Process`/229 signals stand in
     *   for it, as the main chat composer's own guard does.
     * - Shift is held, which is the newline everywhere.
     * - Enter-to-send is off and no modifier is held, so this Enter is a
     *   newline and must reach the field untouched.
     * - The field is empty. A caller whose action needs no text (continuing a
     *   settled thread) still wants that to be a deliberate press of the
     *   button, not a stray Enter that navigates the reader somewhere.
     */
    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        isComposing ||
        event.nativeEvent.isComposing ||
        event.key === 'Process' ||
        event.keyCode === 229
      ) {
        return;
      }
      if (event.key !== 'Enter' || event.shiftKey) return;
      if (!submitOnEnter && !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      if (!canSubmit || value.trim() === '') return;
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
