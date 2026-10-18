import { useContext, useLayoutEffect } from 'react';
import type * as t from '~/admin/types';
import { SoleFieldContext } from '~/admin/contexts/SettingsContext';
import { SectionControls } from './SectionControls';
import { SectionHeader } from './SectionHeader';
import { useLocalize } from '~/admin/hooks';

const LABELABLE = 'input, textarea, select, button, [role="switch"], [role="combobox"]';

/**
 * Names the control after its section in a single-field section: the visible
 * label is the section heading, so `aria-labelledby` (which outranks the
 * control's own `aria-label`) points at "<Section> <field>". Runs after every
 * render because controls can remount without the row re-rendering.
 */
function useSoleFieldName(htmlFor: string | undefined, nameId: string) {
  useLayoutEffect(() => {
    if (!htmlFor) return;
    const target = document.getElementById(htmlFor);
    const control = target?.matches(LABELABLE)
      ? target
      : target?.querySelector<HTMLElement>(LABELABLE);
    if (!control || control.hasAttribute('aria-labelledby')) return;
    control.setAttribute('aria-labelledby', nameId);
    return () => control.removeAttribute('aria-labelledby');
  });
}

/**
 * Ties a row's error to its control (`aria-invalid`, `aria-describedby`), for
 * errors the row shows on the control's behalf (save pipeline issues).
 * Controls that report their own errors keep theirs.
 */
function useErrorDescription(htmlFor: string | undefined, hasError: boolean) {
  useLayoutEffect(() => {
    if (!htmlFor || !hasError) return;
    const target = document.getElementById(htmlFor);
    const control = target?.matches(LABELABLE)
      ? target
      : target?.querySelector<HTMLElement>(LABELABLE);
    if (!control || control.getAttribute('aria-invalid') === 'true') return;
    const errorId = `${htmlFor}-error`;
    const previous = control.getAttribute('aria-describedby');
    control.setAttribute('aria-invalid', 'true');
    if (previous?.split(' ').includes(errorId)) {
      return () => control.removeAttribute('aria-invalid');
    }
    control.setAttribute('aria-describedby', previous ? `${previous} ${errorId}` : errorId);
    return () => {
      control.removeAttribute('aria-invalid');
      if (previous) control.setAttribute('aria-describedby', previous);
      else control.removeAttribute('aria-describedby');
    };
  });
}

function SoleFieldRow({ sole, label, htmlFor, children }: t.SoleFieldRowProps) {
  const localize = useLocalize();
  const nameId = `${sole.headingId}-field`;
  useSoleFieldName(htmlFor, nameId);
  const sameLabel = label.trim().toLowerCase() === sole.sectionTitle.trim().toLowerCase();
  const name = sameLabel
    ? sole.sectionTitle
    : localize('com_admin_config_ui_sole_name', { section: sole.sectionTitle, field: label });

  return (
    <div className="settings-row-sole">
      <span id={nameId} hidden>
        {name}
      </span>
      {children}
    </div>
  );
}

/**
 * One settings row on the shared grid `label | control | trailing` (WS6).
 * WS3 fills the slots; the layout, type scale and responsive collapse live here
 * and in `styles.css` (`.settings-row`). Inside a single-field section the row
 * drops its label column and lends its cells to the section's header row.
 */
export function SettingsRow({
  label,
  htmlFor,
  description,
  learnMoreUrl,
  control,
  chips,
  hint,
  actions,
  error,
  required,
  width,
  marker,
}: t.SettingsRowProps) {
  const sole = useContext(SoleFieldContext);
  useErrorDescription(htmlFor, Boolean(error));
  const errorNode = error ? (
    <div id={htmlFor ? `${htmlFor}-error` : undefined} role="alert" className="settings-error">
      {error}
    </div>
  ) : null;
  const trailing =
    chips || actions ? (
      <div className="settings-row-trailing">
        {chips}
        {actions}
      </div>
    ) : null;

  if (sole) {
    return (
      <SoleFieldRow sole={sole} label={label} htmlFor={htmlFor}>
        <SectionControls width={width}>
          {control}
          {hint}
          {errorNode}
        </SectionControls>
        {trailing}
      </SoleFieldRow>
    );
  }

  return (
    <div className="settings-row" data-marker={marker}>
      <SectionHeader
        title={label}
        description={description}
        learnMoreUrl={learnMoreUrl}
        htmlFor={htmlFor}
        required={required}
        subtitle={hint}
      />
      <SectionControls width={width}>
        {control}
        {errorNode}
      </SectionControls>
      {trailing}
    </div>
  );
}
