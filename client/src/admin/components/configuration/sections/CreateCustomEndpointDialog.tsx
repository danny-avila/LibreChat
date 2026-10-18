/**
 * Dialog for creating a new custom endpoint entry.
 *
 * Uses the same grouped field layout as expanded custom endpoint cards —
 * both are driven by the `FIELD_GROUPS` config in endpoints/groups.ts via
 * the `renderFields` prop injected from the parent.
 */

import { useState, useCallback, useMemo } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { ConfigErrorsProvider } from '~/admin/contexts/ConfigErrorsContext';
import { validateLoadableEndpoint } from '~/admin/utils';
import { FormDialog } from '~/admin/components/shared';
import { useLocalize } from '~/admin/hooks';
import { labelForPath } from '../meta';

/** The draft as it would be added: empty values and empty lists left out. */
function toEntry(draft: t.ConfigRecord): t.ConfigRecord {
  const entry: t.ConfigRecord = {};
  for (const [key, val] of Object.entries(draft)) {
    if (val === '' || val === undefined || val === null) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    entry[key] = val;
  }
  return entry;
}

const DRAFT_PATH = 'create-endpoint';

const RESERVED_NAMES: ReadonlySet<string> = new Set(Object.values(EModelEndpoint));

/** Why a name can't be used: another entry has it (in any letter case), or LibreChat reserves it. */
function nameProblem(name: string, existingNames: ReadonlySet<string>): string | null {
  if (name === '') return null;
  if (RESERVED_NAMES.has(name)) return 'com_admin_config_endpoint_name_reserved';
  const lower = name.toLowerCase();
  for (const existing of existingNames) {
    if (existing.toLowerCase() === lower) return 'com_admin_config_endpoint_name_exists';
  }
  return null;
}

/**
 * Create is enabled once the endpoint has what LibreChat needs to load it (a
 * unique, non-reserved name, an API key, a base URL and a default model
 * list); until then the footer says what is still missing.
 */
export function CreateCustomEndpointDialog({
  open,
  onClose,
  onSave,
  fields,
  existingNames,
  renderFields,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (entry: t.ConfigRecord) => void;
  fields: t.SchemaField[];
  existingNames: ReadonlySet<string>;
  renderFields: t.CollectionRenderFields;
}) {
  const localize = useLocalize();
  const [draft, setDraft] = useState<t.ConfigRecord>({});

  const handleFieldChange = useCallback((key: string, value: t.ConfigValue) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const name = typeof draft.name === 'string' ? draft.name.trim() : '';
  const problem = nameProblem(name, existingNames);
  const isDuplicate = problem != null;
  const missing = useMemo(() => {
    const labels = validateLoadableEndpoint(toEntry(draft), 0).map((issue) =>
      labelForPath(`endpoints.custom.0.${issue.entryPath}`, localize),
    );
    return name ? labels : [localize('com_admin_config_field_name'), ...labels];
  }, [draft, name, localize]);

  const problemText = problem ? localize(problem) : undefined;
  /** The name problem is also shown at the Name field, where it is fixed. */
  const draftErrors = useMemo((): t.PathErrors => {
    const errors: t.PathErrors = {};
    if (problemText) errors[`${DRAFT_PATH}.name`] = problemText;
    return errors;
  }, [problemText]);

  const handleSubmit = useCallback(() => {
    if (!name || isDuplicate || missing.length > 0) return;
    onSave({ ...toEntry(draft), name });
    setDraft({});
    onClose();
  }, [draft, name, isDuplicate, missing, onSave, onClose]);

  const handleClose = useCallback(() => {
    setDraft({});
    onClose();
  }, [onClose]);

  return (
    <FormDialog
      open={open}
      title={localize('com_admin_config_create_endpoint')}
      submitLabel={localize('com_admin_ui_create')}
      submitDisabled={isDuplicate || missing.length > 0}
      saving={false}
      error={problemText}
      hint={
        missing.length > 0
          ? localize('com_admin_config_endpoint_required_missing', { fields: missing.join(', ') })
          : undefined
      }
      size="lg"
      onSubmit={handleSubmit}
      onClose={handleClose}
    >
      <ConfigErrorsProvider value={draftErrors}>
        {renderFields(fields, draft, DRAFT_PATH, handleFieldChange)}
      </ConfigErrorsProvider>
    </FormDialog>
  );
}
