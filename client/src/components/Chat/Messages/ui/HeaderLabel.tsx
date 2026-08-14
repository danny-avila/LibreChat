type HeaderLabelProps = {
  label: string;
  hoverLabel?: string | null;
};

/** Skip agent document ids so the hover label is a real model name. */
export function getHeaderModelName(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  return candidates.find((value) => value != null && value !== '' && !value.startsWith('agent_'));
}

/** Provider name that crossfades to the model name on hover. */
export default function HeaderLabel({ label, hoverLabel }: HeaderLabelProps) {
  if (!hoverLabel || hoverLabel === label) {
    return <span className="min-w-0 truncate">{label}</span>;
  }

  return (
    <span className="header-label min-w-0">
      <span data-label="provider">{label}</span>
      <span data-label="model" aria-hidden="true">
        {hoverLabel}
      </span>
    </span>
  );
}
