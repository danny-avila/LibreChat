import { useMemo } from 'react';
import { Variable, Calendar, User, Clock, Globe, Sparkles, ChevronRight } from 'lucide-react';
import { specialVariables } from 'librechat-data-provider';
import { extractUniqueVariables } from '~/utils';
import { useLocalize } from '~/hooks';

interface ParsedVariable {
  name: string;
  options: string[];
  isDropdown: boolean;
  isSpecial: boolean;
}

const specialVariableIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  current_date: Calendar,
  current_datetime: Clock,
  current_user: User,
  iso_datetime: Globe,
};

const parseVariable = (variable: string): ParsedVariable => {
  const isSpecial = specialVariables[variable.toLowerCase()] != null;
  if (isSpecial) {
    return { name: variable.toLowerCase(), options: [], isDropdown: false, isSpecial: true };
  }

  const colonIndex = variable.indexOf(':');
  if (colonIndex > 0) {
    const name = variable.substring(0, colonIndex);
    const optionsPart = variable.substring(colonIndex + 1);
    const options = optionsPart.split('|').filter(Boolean);
    if (options.length > 1) {
      return { name, options, isDropdown: true, isSpecial: false };
    }
  }

  return { name: variable, options: [], isDropdown: false, isSpecial: false };
};

const DropdownVariableCard = ({ parsed }: { parsed: ParsedVariable }) => {
  const localize = useLocalize();

  return (
    <div
      className="bg-surface-secondary/50 rounded-lg border border-border-light p-2.5 hover:bg-surface-secondary"
      role="listitem"
      aria-label={localize('com_ui_variable_with_options', {
        name: parsed.name,
        count: parsed.options.length,
      })}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded-md bg-surface-tertiary">
          <ChevronRight className="size-3.5 text-text-secondary" aria-hidden="true" />
        </div>
        <span className="text-sm font-medium text-text-primary">{parsed.name}</span>
        <span className="rounded-full bg-surface-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
          {parsed.options.length} {localize('com_ui_options')}
        </span>
      </div>
      <div
        className="flex flex-wrap gap-1.5"
        role="list"
        aria-label={localize('com_ui_available_options')}
      >
        {parsed.options.map((option, index) => (
          <span
            key={index}
            className="rounded-md border border-border-light bg-surface-primary px-2 py-0.5 text-xs text-text-secondary transition-colors hover:bg-surface-secondary"
            role="listitem"
          >
            {option}
          </span>
        ))}
      </div>
    </div>
  );
};

type TSpecialVarLabelKey =
  | 'com_ui_special_var_current_date'
  | 'com_ui_special_var_current_datetime'
  | 'com_ui_special_var_current_user'
  | 'com_ui_special_var_iso_datetime';

const specialVariableLabels: Record<string, TSpecialVarLabelKey> = {
  current_date: 'com_ui_special_var_current_date',
  current_datetime: 'com_ui_special_var_current_datetime',
  current_user: 'com_ui_special_var_current_user',
  iso_datetime: 'com_ui_special_var_iso_datetime',
};

const specialVariableDescs: Record<string, string> = {
  current_date: "Today's date and day of the week",
  current_datetime: 'Local date and time in your timezone',
  current_user: 'Your account display name',
  iso_datetime: 'UTC datetime in ISO 8601 format',
};

const SpecialVariableChip = ({ parsed }: { parsed: ParsedVariable }) => {
  const localize = useLocalize();
  const Icon = specialVariableIcons[parsed.name] || Sparkles;
  const labelKey = specialVariableLabels[parsed.name];
  const description = specialVariableDescs[parsed.name];
  const displayLabel = labelKey ? localize(labelKey) : parsed.name;

  return (
    <div
      className="group flex items-start gap-2 rounded-lg border border-border-light bg-transparent p-2 hover:bg-surface-secondary"
      role="listitem"
      aria-label={displayLabel}
    >
      <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-tertiary">
        <Icon className="size-3.5 text-text-secondary" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-text-primary">{displayLabel}</span>
        {description && <p className="mt-0.5 text-[11px] text-text-secondary">{description}</p>}
      </div>
    </div>
  );
};

const SimpleVariableChip = ({ parsed }: { parsed: ParsedVariable }) => (
  <span
    className="bg-surface-secondary/50 inline-flex items-center gap-1.5 rounded-lg border border-border-light px-2.5 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-tertiary"
    role="listitem"
  >
    <Variable className="size-3 text-text-secondary" aria-hidden="true" />
    <span className="max-w-32 truncate">{parsed.name}</span>
  </span>
);

const PromptVariables = ({ promptText }: { promptText: string }) => {
  const localize = useLocalize();

  const variables = useMemo(() => {
    return extractUniqueVariables(promptText || '');
  }, [promptText]);

  const parsedVariables = useMemo(() => {
    return variables.map(parseVariable);
  }, [variables]);

  const dropdownVariables = parsedVariables.filter((v) => v.isDropdown);
  const specialVars = parsedVariables.filter((v) => v.isSpecial);
  const simpleVariables = parsedVariables.filter((v) => !v.isDropdown && !v.isSpecial);

  if (variables.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border-light bg-surface-primary">
      <header className="flex items-center justify-between border-b border-border-light bg-header-primary px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Variable className="size-4 text-text-secondary" aria-hidden="true" />
          <h4 className="text-sm font-semibold text-text-primary">
            {localize('com_ui_variables')}
          </h4>
        </div>
        <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs font-medium tabular-nums text-text-secondary">
          {variables.length}
        </span>
      </header>

      <div
        className="flex flex-col gap-4 p-3"
        role="list"
        aria-label={localize('com_ui_prompt_variables_list')}
      >
        {specialVars.length > 0 && (
          <section aria-label={localize('com_ui_special_variables')}>
            <h5 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
              {localize('com_ui_special_variables')}
            </h5>
            <div className="grid gap-2 sm:grid-cols-2">
              {specialVars.map((parsed, index) => (
                <SpecialVariableChip key={`special-${index}`} parsed={parsed} />
              ))}
            </div>
          </section>
        )}

        {dropdownVariables.length > 0 && (
          <section aria-label={localize('com_ui_dropdown_variables')}>
            <h5 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
              {localize('com_ui_dropdown_variables')}
            </h5>
            <div className="flex flex-col gap-2">
              {dropdownVariables.map((parsed, index) => (
                <DropdownVariableCard key={`dropdown-${index}`} parsed={parsed} />
              ))}
            </div>
          </section>
        )}

        {simpleVariables.length > 0 && (
          <section aria-label={localize('com_ui_text_variables')}>
            <h5 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
              {localize('com_ui_text_variables')}
            </h5>
            <div className="flex flex-wrap gap-2">
              {simpleVariables.map((parsed, index) => (
                <SimpleVariableChip key={`simple-${index}`} parsed={parsed} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default PromptVariables;
