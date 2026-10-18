import type * as t from '~/admin/types';
import { useLocalize, useFieldState, useValuesScope, useHasValueLayers } from '~/admin/hooks';
import { describeStack, sourceLabel, formatLayerValue, formatConfigValue } from './labels';
import { HoverCard } from '~/admin/ui';
import { labelForPath } from '../meta';
import { cn } from '~/admin/utils';

/** The settings-row chip style (WS6 `state-chip-*`) each value source is drawn with. */
const SOURCE_CHIPS: Readonly<Record<t.ProvenanceSource, string>> = {
  default: 'default',
  runtimeDefault: 'default',
  yaml: 'yaml',
  admin: 'override',
  scope: 'scope',
  inherited: 'inherited',
};

/** Sources a row leaves unmarked: its "Default: …" hint already says it. */
const DEFAULT_SOURCES: ReadonlySet<t.ProvenanceSource> = new Set(['default', 'runtimeDefault']);

/** A default, including one a profile inherits from a Base that does not set it. */
function isDefaultValue(state: t.FieldState): boolean {
  if (DEFAULT_SOURCES.has(state.source)) return true;
  const inherited = state.inherited?.source;
  return state.source === 'inherited' && inherited != null && DEFAULT_SOURCES.has(inherited);
}

/**
 * Whether a field marks the value Global (`endpoints.all`) overrules: only one
 * it holds (librechat.yaml, an override or an edit). An unset field already
 * names Global's value as its Default, and the provider's banner explains why.
 */
export function showsShadow(
  state: t.FieldState,
): state is t.FieldState & { shadowedBy: t.ShadowedBy } {
  return state.shadowedBy != null && (state.isConfigured || state.isOverride || state.isEdited);
}

/** "Ignored (Global)": a value `endpoints.all` takes precedence over (D11), with the reason on hover. */
export function ShadowBadge({ shadowedBy }: { shadowedBy: t.ShadowedBy }) {
  const localize = useLocalize();
  const field = labelForPath(shadowedBy.path, localize);
  const value = formatConfigValue(shadowedBy.value, localize, shadowedBy.path);
  const hint = localize(
    shadowedBy.precedence === 'block'
      ? 'com_admin_config_values_shadowed_block'
      : 'com_admin_config_values_shadowed_field',
    { field, value },
  );
  return (
    <span title={hint} className="state-chip state-chip-shadowed" data-state-chip="shadowed">
      {localize('com_admin_config_values_shadowed')}
      <span className="sr-only">{`, ${hint}`}</span>
    </span>
  );
}

/**
 * Where a field's value comes from (EV-1): Default, LibreChat default,
 * librechat.yaml, Admin override, "Role: USER", Inherited from Base or Hidden.
 * Hovering shows the layer stack ("Default 20,000 · librechat.yaml 1,000,000
 * · Admin override 2,500,000"); screen readers get the same summary. A field
 * shadowed by `endpoints.all` gets an extra warning badge. WS6 places it in
 * the settings row's `chips` slot.
 */
export function ProvenanceChip({ state, scope, hideDefault, path = '' }: t.ProvenanceChipProps) {
  const localize = useLocalize();
  const shadow = showsShadow(state) ? <ShadowBadge shadowedBy={state.shadowedBy} /> : null;
  if (state.ignoredOverride) {
    return (
      <span
        title={localize('com_admin_config_values_ignored_override_desc')}
        className="state-chip state-chip-shadowed"
        data-state-chip="ignored-override"
      >
        {localize('com_admin_config_values_ignored_override')}
        <span className="sr-only">{`, ${localize('com_admin_config_values_ignored_override_desc')}`}</span>
      </span>
    );
  }
  if (hideDefault && isDefaultValue(state) && !state.isHidden) return shadow;

  const text = state.isHidden
    ? localize('com_admin_config_values_source_hidden')
    : sourceLabel(state.source, localize, scope);
  const chip = state.isHidden ? 'hidden' : SOURCE_CHIPS[state.source];
  const stack = state.stack ?? [];
  const summary = describeStack(state, localize, path, scope);
  const topIndex = stack.length - 1;

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1">
      <HoverCard openDelay={300}>
        <HoverCard.Trigger asChild>
          <span
            className={cn('state-chip', `state-chip-${chip}`)}
            data-provenance={state.isHidden ? 'hidden' : state.source}
          >
            {text}
            {summary && (
              <span className="sr-only">
                {localize('com_admin_config_values_stack_aria', { stack: summary })}
              </span>
            )}
          </span>
        </HoverCard.Trigger>
        {stack.length > 0 && (
          <HoverCard.Content side="bottom" align="start" className="max-w-xs">
            <div className="flex flex-col gap-1.5 p-1 text-xs" aria-hidden="true">
              <span className="font-semibold text-(--cui-color-text-default)">
                {localize('com_admin_config_values_stack_title')}
              </span>
              <ol className="flex flex-col gap-1">
                {stack.map((layer, index) => (
                  <li
                    key={`${layer.source}-${index}`}
                    className={cn(
                      'flex items-baseline justify-between gap-3',
                      index === topIndex
                        ? 'font-medium text-(--cui-color-text-default)'
                        : 'text-(--cui-color-text-muted)',
                    )}
                  >
                    <span>{sourceLabel(layer.source, localize, scope)}</span>
                    <span className="truncate">{formatLayerValue(layer, localize, path)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </HoverCard.Content>
        )}
      </HoverCard>
      {shadow}
    </span>
  );
}

/**
 * The provenance chip of one field, read from the nearest `ConfigValuesProvider`;
 * nothing outside a provider that has the layer model.
 */
export function FieldProvenance({ path, hideDefault }: t.FieldProvenanceProps) {
  const state = useFieldState(path);
  const scope = useValuesScope();
  const hasLayers = useHasValueLayers();
  if (!hasLayers) return null;
  return <ProvenanceChip state={state} scope={scope} hideDefault={hideDefault} path={path} />;
}
