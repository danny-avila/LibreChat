import { useState, useMemo, useCallback, useEffect } from 'react';
import { PrincipalType } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { useLocalize, useImportPreview, importTargetLabel } from '~/admin/hooks';
import { Source, Targets, Preview, SyntaxFrame } from './wizard';
import { parseImportedYaml } from '~/admin/api';
import { Button, Dialog } from '~/admin/ui';

const STEPS: t.ImportStep[] = ['input', 'target', 'preview'];
const STEP_KEYS: Readonly<Record<t.ImportStep, string>> = {
  input: 'com_admin_config_review_import_step_source',
  target: 'com_admin_config_review_import_step_target',
  preview: 'com_admin_config_review_import_step_preview',
};

/**
 * The YAML import wizard (WS7, RV-6): paste or upload, choose any role,
 * group or user (or Base) as the target, preview exactly the YAML's keys
 * against what the target has now, and apply the chosen ones through the
 * normal validated save. Imports merge; librechat.yaml is never modified.
 */
export function ImportYamlDialog({
  open,
  onClose,
  currentScope,
  schemaTree,
  schemaPathSet,
  onImport,
}: t.ImportYamlDialogProps) {
  const localize = useLocalize();
  const [step, setStep] = useState<t.ImportStep>('input');
  const [activeTab, setActiveTab] = useState<t.ImportTab>('upload');
  const [yamlText, setYamlText] = useState('');
  const [fileName, setFileName] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [errorMark, setErrorMark] = useState<{ line: number; column: number }>();
  const [validationErrors, setValidationErrors] = useState<t.ImportValidationError[]>();
  const [appConfig, setAppConfig] = useState<t.ConfigRecord | null>(null);

  const defaultMode: t.TargetMode = currentScope ? 'current' : 'base';
  const [mode, setMode] = useState<t.TargetMode>(defaultMode);
  const [kind, setKind] = useState<t.ImportPrincipalKind>(PrincipalType.ROLE);
  const [selected, setSelected] = useState<t.ImportPrincipal | null>(null);
  const [newType, setNewType] = useState<PrincipalType.ROLE | PrincipalType.GROUP>(
    PrincipalType.ROLE,
  );
  const [newName, setNewName] = useState('');
  const [included, setIncluded] = useState<Set<string> | null>(null);

  const target = useMemo((): t.ImportTarget | null => {
    if (mode === 'base') return { type: 'base' };
    if (mode === 'current') {
      return currentScope ? { type: 'scope', scope: currentScope, exists: true } : null;
    }
    if (mode === 'existing') return selected ? { type: 'scope', ...selected } : null;
    const name = newName.trim();
    return name ? { type: 'create', principalType: newType, name } : null;
  }, [mode, currentScope, selected, newName, newType]);

  const preview = useImportPreview({
    schemaTree,
    schemaPathSet,
    appConfig: step === 'input' ? null : appConfig,
    target: step === 'preview' ? target : null,
  });

  /** Leaves already equal to what the target has, and keys this panel does not recognise, start unchecked. */
  const defaultIncluded = useMemo(
    () =>
      new Set(
        preview.groups.flatMap((group) =>
          group.rows.filter((row) => !row.unchanged && !row.unknown).map((row) => row.fieldPath),
        ),
      ),
    [preview.groups],
  );
  const selection = included ?? defaultIncluded;

  const reset = useCallback(() => {
    setStep('input');
    setActiveTab('upload');
    setYamlText('');
    setFileName(undefined);
    setLoading(false);
    setError(undefined);
    setErrorMark(undefined);
    setValidationErrors(undefined);
    setAppConfig(null);
    setMode(defaultMode);
    setKind(PrincipalType.ROLE);
    setSelected(null);
    setNewType(PrincipalType.ROLE);
    setNewName('');
    setIncluded(null);
  }, [defaultMode]);

  /** A profile opened (or closed) since the last import changes which target is preselected. */
  useEffect(() => {
    if (open && step === 'input') setMode(defaultMode);
  }, [open, step, defaultMode]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const clearErrors = () => {
    setError(undefined);
    setErrorMark(undefined);
    setValidationErrors(undefined);
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    clearErrors();
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') setYamlText(text);
    };
    reader.onerror = () => setError(localize('com_admin_config_import_error'));
    reader.readAsText(file);
  };

  const handleValidate = async () => {
    if (!yamlText.trim()) return;
    setLoading(true);
    clearErrors();
    try {
      const result = await parseImportedYaml({ data: { yamlContent: yamlText } });
      if (!result.success || !result.appConfig) {
        setError(result.error ?? localize('com_admin_config_import_error'));
        setErrorMark(result.mark);
        setValidationErrors(result.validationErrors);
        return;
      }
      setAppConfig(result.appConfig);
      setStep('target');
    } catch (err) {
      setError(err instanceof Error ? err.message : localize('com_admin_config_import_error'));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!target) return;
    setLoading(true);
    setError(undefined);
    try {
      await onImport({ target, entries: preview.entriesFor(selection) });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : localize('com_admin_config_import_error'));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (fieldPath: string, include: boolean) => {
    const next = new Set(selection);
    if (include) next.add(fieldPath);
    else next.delete(fieldPath);
    setIncluded(next);
  };

  const goTo = (next: t.ImportStep) => {
    clearErrors();
    if (next !== 'preview') setIncluded(null);
    setStep(next);
  };

  const { loading: previewLoading, issuesFor } = preview;
  const importIssues = useMemo(
    () => (step === 'preview' && !previewLoading ? issuesFor(selection) : []),
    [step, previewLoading, issuesFor, selection],
  );

  const targetLabel = target ? importTargetLabel(target, localize) : '';
  const count = selection.size;
  const stepIndex = STEPS.indexOf(step);

  const primary = (() => {
    if (step === 'input') {
      return {
        label: loading
          ? localize('com_admin_ui_loading')
          : localize('com_admin_config_review_import_next'),
        disabled: !yamlText.trim() || loading,
        onClick: handleValidate,
      };
    }
    if (step === 'target') {
      return {
        label: localize('com_admin_config_review_import_preview'),
        disabled: target == null,
        onClick: async () => goTo('preview'),
      };
    }
    return {
      label: loading
        ? localize('com_admin_config_import_saving')
        : localize('com_admin_config_review_import_apply', { count, target: targetLabel }),
      disabled: loading || preview.loading || count === 0 || importIssues.length > 0,
      onClick: handleApply,
    };
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <Dialog.Content
        title={localize('com_admin_config_import_yaml_title')}
        showClose
        onClose={handleClose}
      >
        <div className="flex flex-col gap-4">
          <p className="m-0 text-xs font-medium text-(--cui-color-text-muted)" aria-live="polite">
            {localize('com_admin_config_review_import_step', {
              n: stepIndex + 1,
              total: STEPS.length,
              name: localize(STEP_KEYS[step]),
            })}
          </p>

          {step === 'input' && (
            <Source
              activeTab={activeTab}
              onTabChange={(tab) => {
                setActiveTab(tab);
                clearErrors();
              }}
              yamlText={yamlText}
              onTextChange={(text) => {
                setYamlText(text);
                clearErrors();
              }}
              fileName={fileName}
              onFile={handleFile}
            />
          )}

          {step === 'target' && (
            <Targets
              open={open}
              currentScope={currentScope}
              mode={mode}
              onModeChange={setMode}
              kind={kind}
              onKindChange={(next) => {
                setKind(next);
                setSelected(null);
              }}
              selected={selected}
              onSelect={setSelected}
              newType={newType}
              onNewTypeChange={setNewType}
              newName={newName}
              onNewNameChange={setNewName}
            />
          )}

          {step === 'preview' && (
            <Preview
              preview={preview}
              targetLabel={targetLabel}
              isScope={target?.type !== 'base'}
              included={selection}
              onToggle={toggle}
            />
          )}

          {importIssues.length > 0 && (
            <div
              className="bg-status-error-subtle flex flex-col gap-1 rounded-lg px-3 py-2"
              role="alert"
            >
              <span className="text-sm font-medium text-(--cui-color-text-danger)">
                {localize('com_admin_config_review_import_issues', { count: importIssues.length })}
              </span>
              <ul className="m-0 max-h-32 list-none overflow-auto p-0 text-xs text-(--cui-color-text-danger)">
                {importIssues.map((issue) => (
                  <li key={issue} className="py-0.5 wrap-anywhere">
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div
              className="bg-status-error-subtle flex flex-col gap-2 rounded-lg px-3 py-2"
              role="alert"
            >
              <span className="text-sm font-medium wrap-anywhere text-(--cui-color-text-danger)">
                {error}
              </span>
              {errorMark && <SyntaxFrame text={yamlText} mark={errorMark} />}
              {validationErrors && validationErrors.length > 0 && (
                <ul className="m-0 max-h-32 list-none overflow-auto p-0 text-xs text-(--cui-color-text-danger)">
                  {validationErrors.slice(0, 10).map((issue, i) => (
                    <li key={`${issue.path}-${i}`} className="py-0.5 wrap-anywhere">
                      <code>{issue.path}</code>: {issue.message}
                    </li>
                  ))}
                  {validationErrors.length > 10 && (
                    <li className="py-0.5 opacity-70">
                      {localize('com_admin_config_validation_more', {
                        count: String(validationErrors.length - 10),
                      })}
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              htmlType="button"
              type="secondary"
              label={localize(
                step === 'input' ? 'com_admin_ui_cancel' : 'com_admin_config_import_back',
              )}
              onClick={step === 'input' ? handleClose : () => goTo(STEPS[stepIndex - 1])}
              disabled={loading}
            />
            <Button
              htmlType="button"
              type="primary"
              label={primary.label}
              iconLeft={loading ? 'loading-animated' : undefined}
              onClick={() => void primary.onClick()}
              disabled={primary.disabled}
            />
          </div>
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
