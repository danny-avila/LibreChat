import { useRef, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowLeft, Upload } from 'lucide-react';
import { Button, Label, Input, Spinner, useToastContext } from '@librechat/client';
import type { TTarsKnowledgeBase } from 'librechat-data-provider';
import {
  useTarsModelOptionsQuery,
  useTarsKnowledgeBasesQuery,
  useUpdateTarsKnowledgeBaseMutation,
  useDeleteTarsKnowledgeBaseMutation,
  useUploadTarsKnowledgeBaseMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';

type View = 'list' | 'edit' | 'upload';

const selectClass =
  'w-full rounded-lg border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-heavy';

function KnowledgeManager() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: knowledgeBases = [], isLoading } = useTarsKnowledgeBasesQuery();
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<TTarsKnowledgeBase | null>(null);

  const [editForm, setEditForm] = useState({ name: '', description: '', maxRetrieve: 20 });
  const [uploadForm, setUploadForm] = useState({
    name: '',
    description: '',
    llmModel: '',
    embeddingModel: '',
    rerankModel: '',
    maxRetrieve: 20,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const { data: models } = useTarsModelOptionsQuery({ enabled: view === 'upload' });

  const onError = () =>
    showToast({ message: localize('com_ui_tars_admin_error'), status: 'error' });
  const backToList = (messageKey: Parameters<typeof localize>[0]) => {
    showToast({ message: localize(messageKey), status: 'success' });
    setView('list');
    setEditing(null);
  };

  const updateMutation = useUpdateTarsKnowledgeBaseMutation({
    onSuccess: () => backToList('com_ui_tars_kb_saved'),
    onError,
  });
  const deleteMutation = useDeleteTarsKnowledgeBaseMutation({
    onSuccess: () => backToList('com_ui_tars_kb_deleted'),
    onError,
  });
  const uploadMutation = useUploadTarsKnowledgeBaseMutation({
    onSuccess: () => {
      setFile(null);
      setUploadForm({
        name: '',
        description: '',
        llmModel: '',
        embeddingModel: '',
        rerankModel: '',
        maxRetrieve: 20,
      });
      backToList('com_ui_tars_kb_uploaded');
    },
    onError,
  });

  const openEdit = (kb: TTarsKnowledgeBase) => {
    setEditing(kb);
    setEditForm({
      name: kb.name,
      description: kb.description ?? '',
      maxRetrieve: kb.max_retrieve_count ?? 20,
    });
    setView('edit');
  };

  const handleUpdate = () => {
    if (!editing) {
      return;
    }
    updateMutation.mutate({
      id: editing.id,
      data: {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        new_max_retrieve_count: Number(editForm.maxRetrieve),
      },
    });
  };

  const handleUpload = () => {
    if (!uploadForm.name.trim() || !uploadForm.llmModel || !file) {
      showToast({ message: localize('com_ui_tars_kb_upload_required'), status: 'error' });
      return;
    }
    const formData = new FormData();
    formData.append('knowledgeName', uploadForm.name.trim());
    formData.append('description', uploadForm.description.trim());
    formData.append('llmModel', uploadForm.llmModel);
    if (uploadForm.embeddingModel) {
      formData.append('embeddingModel', uploadForm.embeddingModel);
    }
    if (uploadForm.rerankModel) {
      formData.append('rerankModel', uploadForm.rerankModel);
    }
    formData.append('maxRetrieveCount', String(uploadForm.maxRetrieve));
    formData.append('file', file);
    uploadMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (view === 'edit' && editing) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setView('list')}
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="icon-sm" /> {localize('com_ui_back')}
        </button>
        <div>
          <Label htmlFor="kb-name">{localize('com_ui_name')}</Label>
          <Input
            id="kb-name"
            value={editForm.name}
            onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="kb-desc">{localize('com_ui_description')}</Label>
          <textarea
            id="kb-desc"
            rows={3}
            value={editForm.description}
            onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
            className="min-h-[72px] w-full resize-none rounded-lg border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-heavy"
          />
        </div>
        <div>
          <Label htmlFor="kb-retrieve">{localize('com_ui_tars_kb_max_retrieve')}</Label>
          <Input
            id="kb-retrieve"
            type="number"
            value={editForm.maxRetrieve}
            onChange={(e) => setEditForm((p) => ({ ...p, maxRetrieve: Number(e.target.value) }))}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setView('list')}>
            {localize('com_ui_cancel')}
          </Button>
          <Button variant="submit" onClick={handleUpdate} disabled={updateMutation.isLoading}>
            {updateMutation.isLoading ? <Spinner /> : localize('com_ui_save')}
          </Button>
        </div>
      </div>
    );
  }

  if (view === 'upload') {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setView('list')}
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="icon-sm" /> {localize('com_ui_back')}
        </button>
        <div>
          <Label htmlFor="kb-up-name">{localize('com_ui_name')}</Label>
          <Input
            id="kb-up-name"
            value={uploadForm.name}
            onChange={(e) => setUploadForm((p) => ({ ...p, name: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="kb-up-desc">{localize('com_ui_description')}</Label>
          <textarea
            id="kb-up-desc"
            rows={2}
            value={uploadForm.description}
            onChange={(e) => setUploadForm((p) => ({ ...p, description: e.target.value }))}
            className="min-h-[56px] w-full resize-none rounded-lg border border-border-light bg-transparent px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-heavy"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="kb-llm">{localize('com_ui_tars_kb_llm_model')}</Label>
            <select
              id="kb-llm"
              className={selectClass}
              value={uploadForm.llmModel}
              onChange={(e) => setUploadForm((p) => ({ ...p, llmModel: e.target.value }))}
            >
              <option value="">—</option>
              {models?.llm.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="kb-embed">{localize('com_ui_tars_kb_embedding_model')}</Label>
            <select
              id="kb-embed"
              className={selectClass}
              value={uploadForm.embeddingModel}
              onChange={(e) => setUploadForm((p) => ({ ...p, embeddingModel: e.target.value }))}
            >
              <option value="">—</option>
              {models?.embedding.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="kb-rerank">{localize('com_ui_tars_kb_rerank_model')}</Label>
            <select
              id="kb-rerank"
              className={selectClass}
              value={uploadForm.rerankModel}
              onChange={(e) => setUploadForm((p) => ({ ...p, rerankModel: e.target.value }))}
            >
              <option value="">—</option>
              {models?.rerank.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label>{localize('com_ui_tars_kb_file')}</Label>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-1">
              <Upload className="icon-sm" /> {localize('com_ui_tars_kb_choose_file')}
            </Button>
            <span className="truncate text-sm text-text-secondary">
              {file?.name ?? localize('com_ui_none')}
            </span>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setView('list')}>
            {localize('com_ui_cancel')}
          </Button>
          <Button variant="submit" onClick={handleUpload} disabled={uploadMutation.isLoading}>
            {uploadMutation.isLoading ? <Spinner /> : localize('com_ui_tars_kb_upload')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="submit" onClick={() => setView('upload')} className="gap-1">
          <Plus className="icon-sm" /> {localize('com_ui_tars_kb_new')}
        </Button>
      </div>
      {knowledgeBases.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-secondary">{localize('com_ui_none')}</p>
      ) : (
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {knowledgeBases.map((kb) => (
            <div
              key={kb.id}
              className="flex items-center justify-between rounded-lg border border-border-light p-3"
            >
              <div className="min-w-0">
                <span className="truncate font-medium text-text-primary">{kb.name}</span>
                <p className="text-xs text-text-secondary">
                  {localize('com_ui_tars_kb_stats', {
                    docs: kb.document_count ?? 0,
                    chunks: kb.total_chunk_count ?? 0,
                  })}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={localize('com_ui_edit')}
                  onClick={() => openEdit(kb)}
                  className="rounded p-2 hover:bg-surface-hover"
                >
                  <Pencil className="icon-sm" />
                </button>
                <button
                  type="button"
                  aria-label={localize('com_ui_delete')}
                  onClick={() => {
                    if (window.confirm(localize('com_ui_tars_kb_delete_confirm'))) {
                      deleteMutation.mutate(kb.id);
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

export default KnowledgeManager;
