import { forwardRef } from 'react';
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
  /** Held above the field — an alert, a receipt, a staged-context strip. */
  header?: ReactNode;
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
      header,
      className,
    }: ComposerProps,
    ref: Ref<HTMLTextAreaElement>,
  ) {
    /** `isComposing` guards the IME: committing a candidate fires Enter, and
     *  submitting there would send a half-typed word in every CJK locale. */
    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
      event.preventDefault();
      if (!canSubmit) return;
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
        {header}
        <TextareaAutosize
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
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
                <SendIcon size={20} />
              </button>
            }
          />
        </div>
      </div>
    );
  });

export default Composer;
