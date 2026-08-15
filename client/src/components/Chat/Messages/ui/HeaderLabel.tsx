import { useLocalize } from '~/hooks';

type HeaderLabelProps = {
  label: string;
  hoverLabel?: string | null;
};

/** Agents and assistants are keyed by document id, and a message's `model`
 *  carries that id rather than a model name, so neither prefix may reach the
 *  header. */
const DOCUMENT_ID_PREFIXES = ['agent_', 'asst_'];

/** Skip document ids so the hover label is a real model name. */
export function getHeaderModelName(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  return candidates.find(
    (value) =>
      value != null &&
      value !== '' &&
      !DOCUMENT_ID_PREFIXES.some((prefix) => value.startsWith(prefix)),
  );
}

/** Provider name that crossfades to the model name on hover. The crossfade is
 *  pointer-only, so the model is also carried in text that never hides rather
 *  than left behind a hover the keyboard cannot reach. */
export default function HeaderLabel({ label, hoverLabel }: HeaderLabelProps) {
  const localize = useLocalize();

  if (!hoverLabel || hoverLabel === label) {
    return <span className="min-w-0 truncate">{label}</span>;
  }

  return (
    <span className="header-label min-w-0">
      <span data-label="provider">{label}</span>
      <span data-label="model" aria-hidden="true">
        {hoverLabel}
      </span>
      <span className="sr-only">{localize('com_ui_message_model', { 0: hoverLabel })}</span>
    </span>
  );
}
