import { ChevronDown, ChevronUp } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const AGENT_STYLE_TOOLS = new Set(['image_gen_oai', 'image_edit_oai', 'gemini_image_gen']);

export default function ProgressText({
  progress,
  error,
  toolName = '',
  onClick,
  hasInput,
  isExpanded,
}: {
  progress: number;
  error?: boolean;
  toolName?: string;
  onClick?: () => void;
  hasInput?: boolean;
  isExpanded?: boolean;
}) {
  const localize = useLocalize();

  const getText = () => {
    if (error) {
      return localize('com_ui_image_gen_failed');
    }

    if (toolName === 'image_edit_oai') {
      if (progress >= 1) {
        return localize('com_ui_image_edited');
      }
      if (progress >= 0.7) {
        return localize('com_ui_final_touch');
      }
      if (progress >= 0.5) {
        return localize('com_ui_adding_details');
      }
      if (progress >= 0.3) {
        return localize('com_ui_edit_editing_image');
      }
      return localize('com_ui_getting_started');
    }

    if (toolName === 'gemini_image_gen') {
      if (progress >= 1) {
        return localize('com_ui_image_created');
      }
      if (progress >= 0.7) {
        return localize('com_ui_final_touch');
      }
      if (progress >= 0.5) {
        return localize('com_ui_adding_details');
      }
      if (progress >= 0.3) {
        return localize('com_ui_creating_image');
      }
      return localize('com_ui_getting_started');
    }

    if (AGENT_STYLE_TOOLS.has(toolName)) {
      if (progress >= 1) {
        return localize('com_ui_image_created');
      }
      if (progress >= 0.7) {
        return localize('com_ui_final_touch');
      }
      if (progress >= 0.5) {
        return localize('com_ui_adding_details');
      }
      if (progress >= 0.3) {
        return localize('com_ui_creating_image');
      }
      return localize('com_ui_getting_started');
    }

    if (progress >= 1) {
      return localize('com_ui_image_created');
    }
    return localize('com_ui_generating_image');
  };

  const text = getText();

  return (
    <button
      type="button"
      className={cn(
        'progress-text-content absolute left-0 top-0 inline-flex w-full items-center gap-2 overflow-visible whitespace-nowrap',
        !hasInput && 'pointer-events-none',
      )}
      disabled={!hasInput}
      onClick={hasInput ? onClick : undefined}
      aria-expanded={hasInput ? isExpanded : undefined}
    >
      <span className={cn('font-medium', progress < 1 && 'shimmer')}>{text}</span>
      {hasInput &&
        (isExpanded ? (
          <ChevronUp className="size-4 shrink-0 translate-y-[1px]" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-4 shrink-0 translate-y-[1px]" aria-hidden="true" />
        ))}
    </button>
  );
}
