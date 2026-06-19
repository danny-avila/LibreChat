import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { Button, Label, Input, Switch, Spinner, useToastContext } from '@librechat/client';
import type { TTarsDomain, TTarsDomainInput } from 'librechat-data-provider';
import {
  useTarsDomainPrepareDataQuery,
  useCreateTarsDomainMutation,
  useUpdateTarsDomainMutation,
  useDeleteTarsDomainMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';

const DOMAIN_FUNCTION_KEYS = [
  'file_upload',
  'web_search',
  'rag_search',
  'file_generate',
  'suggested_questions',
] as const;

type DomainFunctionMap = Record<string, { enabled: boolean; default_value: boolean }>;

const parseDomainFunctions = (raw: string | null | undefined): DomainFunctionMap => {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as DomainFunctionMap;
  } catch {
    return {};
  }
};

const csvToSet = (raw: string | null | undefined): Set<string> =>
  new Set(
    (raw ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );

type FormState = {
  name: string;
  description: string;
  status: boolean;
  roleIds: Set<string>;
  kbIds: Set<string>;
  functions: Record<string, boolean>;
};

const toFormState = (domain?: TTarsDomain): FormState => {
  const fns = parseDomainFunctions(domain?.domain_functions);
  const functions: Record<string, boolean> = {};
  for (const key of DOMAIN_FUNCTION_KEYS) {
    functions[key] = fns[key]?.default_value ?? true;
  }
  return {
    name: domain?.name ?? '',
    description: domain?.description ?? '',
    status: domain?.status ?? true,
    roleIds: csvToSet(domain?.role_ids),
    kbIds: csvToSet(domain?.knowledge_base_ids),
    functions,
  };
};

function CheckboxList({
  items,
  selected,
  onToggle,
  emptyLabel,
}: {
  items: { id: string; label: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  emptyLabel: string;
}) {
  if (!items.length) {
    return <p className="text-sm text-text-secondary">{emptyLabel}</p>;
  }
  return (
    <div className="max-h-40 overflow-y-auto rounded-lg border border-border-light p-2">
      {items.map((item) => (
        <label key={item.id} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
          <input
            type="checkbox"
            checked={selected.has(item.id)}
            onChange={() => onToggle(item.id)}
            className="h-4 w-4"
          />
          <span className="truncate text-text-primary">{item.label}</span>
        </label>
      ))}
    </div>
  );
}

function DomainManager() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data, isLoading } = useTarsDomainPrepareDataQuery();
  const [editing, setEditing] = useState<TTarsDomain | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>(() => toFormState());

  const roleItems = useMemo(
    () => (data?.roles ?? []).map((role) => ({ id: String(role.id), label: role.name })),
    [data?.roles],
  );
  const kbItems = useMemo(
    () => (data?.knowledge_bases ?? []).map((kb) => ({ id: kb.id, label: kb.name })),
    [data?.knowledge_bases],
  );

  const onMutated = (messageKey: Parameters<typeof localize>[0]) => {
    showToast({ message: localize(messageKey), status: 'success' });
    setEditing(undefined);
  };
  const onError = () =>
    showToast({ message: localize('com_ui_tars_admin_error'), status: 'error' });

  const createMutation = useCreateTarsDomainMutation({
    onSuccess: () => onMutated('com_ui_tars_domain_saved'),
    onError,
  });
  const updateMutation = useUpdateTarsDomainMutation({
    onSuccess: () => onMutated('com_ui_tars_domain_saved'),
    onError,
  });
  const deleteMutation = useDeleteTarsDomainMutation({
    onSuccess: () => onMutated('com_ui_tars_domain_deleted'),
    onError,
  });

  const openForm = (domain?: TTarsDomain) => {
    setEditing(domain ?? null);
    setForm(toFormState(domain));
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      showToast({ message: localize('com_ui_tars_domain_name_required'), status: 'error' });
      return;
    }
    const domainFunctions: DomainFunctionMap = {};
    for (const key of DOMAIN_FUNCTION_KEYS) {
      domainFunctions[key] = { enabled: true, default_value: form.functions[key] };
    }
    const payload: TTarsDomainInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      role_ids: [...form.roleIds].join(','),
      knowledge_base_ids: [...form.kbIds].join(','),
      domain_functions: JSON.stringify(domainFunctions),
      status: form.status ? 1 : 0,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleIn = (key: 'roleIds' | 'kbIds') => (id: string) =>
    setForm((prev) => {
      const next = new Set(prev[key]);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...prev, [key]: next };
    });

  const isSaving = createMutation.isLoading || updateMutation.isLoading;

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (editing !== undefined) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setEditing(undefined)}
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="icon-sm" /> {localize('com_ui_back')}
        </button>

        <div>
          <Label htmlFor="domain-name">{localize('com_ui_name')}</Label>
          <Input
            id="domain-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </div>

        <div>
          <Label htmlFor="domain-desc">{localize('com_ui_description')}</Label>
          <textarea
            id="domain-desc"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            rows={3}
            className="min-h-[72px] w-full resize-none rounded-lg border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-heavy"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>{localize('com_ui_tars_domain_roles')}</Label>
            <CheckboxList
              items={roleItems}
              selected={form.roleIds}
              onToggle={toggleIn('roleIds')}
              emptyLabel={localize('com_ui_none')}
            />
          </div>
          <div>
            <Label>{localize('com_ui_tars_knowledge_bases')}</Label>
            <CheckboxList
              items={kbItems}
              selected={form.kbIds}
              onToggle={toggleIn('kbIds')}
              emptyLabel={localize('com_ui_none')}
            />
          </div>
        </div>

        <div>
          <Label>{localize('com_ui_tars_domain_functions')}</Label>
          <div className="mt-1 space-y-2 rounded-lg border border-border-light p-3">
            {DOMAIN_FUNCTION_KEYS.map((key) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-text-primary">
                  {localize(`com_ui_tars_fn_${key}`)}
                </span>
                <Switch
                  checked={form.functions[key]}
                  onCheckedChange={(checked) =>
                    setForm((p) => ({ ...p, functions: { ...p.functions, [key]: checked } }))
                  }
                  aria-label={localize(`com_ui_tars_fn_${key}`)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-text-primary">{localize('com_ui_tars_domain_status')}</span>
          <Switch
            checked={form.status}
            onCheckedChange={(checked) => setForm((p) => ({ ...p, status: checked }))}
            aria-label={localize('com_ui_tars_domain_status')}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEditing(undefined)}>
            {localize('com_ui_cancel')}
          </Button>
          <Button variant="submit" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Spinner /> : localize('com_ui_save')}
          </Button>
        </div>
      </div>
    );
  }

  const domains = data?.sys_domains ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="submit" onClick={() => openForm()} className="gap-1">
          <Plus className="icon-sm" /> {localize('com_ui_tars_domain_new')}
        </Button>
      </div>
      {domains.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-secondary">{localize('com_ui_none')}</p>
      ) : (
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {domains.map((domain) => (
            <div
              key={domain.id}
              className="flex items-center justify-between rounded-lg border border-border-light p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-text-primary">{domain.name}</span>
                  {!domain.status && (
                    <span className="rounded bg-surface-tertiary px-1.5 py-0.5 text-xs text-text-secondary">
                      {localize('com_ui_tars_domain_disabled')}
                    </span>
                  )}
                </div>
                {domain.description && (
                  <p className="truncate text-sm text-text-secondary">{domain.description}</p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={localize('com_ui_edit')}
                  onClick={() => openForm(domain)}
                  className="rounded p-2 hover:bg-surface-hover"
                >
                  <Pencil className="icon-sm" />
                </button>
                <button
                  type="button"
                  aria-label={localize('com_ui_delete')}
                  onClick={() => {
                    if (window.confirm(localize('com_ui_tars_domain_delete_confirm'))) {
                      deleteMutation.mutate(domain.id);
                    }
                  }}
                  className="rounded p-2 text-red-500 hover:bg-surface-hover"
                >
                  <Trash2 className="icon-sm" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DomainManager;
