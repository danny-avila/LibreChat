import React, { useState, useCallback, useMemo, memo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Plus, Settings, Trash2, MessageSquare, FileText, Brain, ArrowLeft, X } from 'lucide-react';
import { Button, Spinner, Input, useToastContext } from '@librechat/client';
import type { TUserProject, UserProjectUpdateParams, TProjectMemoryEntry } from 'librechat-data-provider';
import {
  useUserProjectQuery,
  useUpdateUserProjectMutation,
  useDeleteUserProjectMutation,
} from '~/data-provider';
import ProjectDialog from './ProjectDialog';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const MemoryEntry = memo(
  ({
    entry,
    onRemove,
  }: {
    entry: TProjectMemoryEntry;
    onRemove: () => void;
  }) => (
    <div className="flex items-start gap-2 rounded-lg border border-border-light bg-surface-secondary p-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-text-tertiary">{entry.key}</div>
        <div className="mt-0.5 text-sm text-text-primary">{entry.value}</div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="flex-shrink-0 rounded p-1 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-red-500"
        aria-label="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ),
);

MemoryEntry.displayName = 'MemoryEntry';

function AddMemoryForm({
  onAdd,
}: {
  onAdd: (entry: TProjectMemoryEntry) => void;
}) {
  const localize = useLocalize();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !value.trim()) {
      return;
    }
    onAdd({ key: key.trim(), value: value.trim() });
    setKey('');
    setValue('');
  };

  return (
    <form onSubmit={handleAdd} className="flex gap-2">
      <Input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder={localize('com_ui_project_memory_key')}
        className="w-1/3"
      />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={localize('com_ui_project_memory_value')}
        className="flex-1"
      />
      <Button type="submit" size="sm" disabled={!key.trim() || !value.trim()}>
        <Plus className="h-4 w-4" />
      </Button>
    </form>
  );
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chats' | 'instructions' | 'memory'>('chats');

  const { data: project, isLoading } = useUserProjectQuery(projectId ?? '');
  const updateMutation = useUpdateUserProjectMutation();
  const deleteMutation = useDeleteUserProjectMutation();

  const handleDelete = useCallback(() => {
    if (!projectId || !window.confirm(localize('com_ui_project_delete_confirm'))) {
      return;
    }
    deleteMutation.mutate(projectId, {
      onSuccess: () => {
        showToast({ message: 'Project deleted', status: 'success' });
        navigate('/c/new');
      },
    });
  }, [projectId, deleteMutation, navigate, showToast, localize]);

  const handleAddMemory = useCallback(
    (entry: TProjectMemoryEntry) => {
      if (!project || !projectId) {
        return;
      }
      const existing = project.memory ?? [];
      const data: UserProjectUpdateParams = {
        memory: [...existing, entry],
      };
      updateMutation.mutate({ projectId, data });
    },
    [project, projectId, updateMutation],
  );

  const handleRemoveMemory = useCallback(
    (index: number) => {
      if (!project || !projectId) {
        return;
      }
      const existing = project.memory ?? [];
      const data: UserProjectUpdateParams = {
        memory: existing.filter((_, i) => i !== index),
      };
      updateMutation.mutate({ projectId, data });
    },
    [project, projectId, updateMutation],
  );

  const handleSaveInstructions = useCallback(
    (instructions: string) => {
      if (!projectId) {
        return;
      }
      updateMutation.mutate(
        { projectId, data: { instructions } },
        {
          onSuccess: () => showToast({ message: 'Instructions saved', status: 'success' }),
        },
      );
    },
    [projectId, updateMutation, showToast],
  );

  const tabs = useMemo(
    () => [
      { id: 'chats' as const, label: localize('com_ui_project_chats'), icon: MessageSquare },
      { id: 'instructions' as const, label: localize('com_ui_project_instructions'), icon: FileText },
      { id: 'memory' as const, label: localize('com_ui_project_memory'), icon: Brain },
    ],
    [localize],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-text-secondary">Project not found</p>
        <Button variant="outline" onClick={() => navigate('/c/new')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {localize('com_ui_back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-border-light px-6 py-4">
        <button
          type="button"
          onClick={() => navigate('/c/new')}
          className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label={localize('com_ui_back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span
          className="h-4 w-4 flex-shrink-0 rounded-full"
          style={{ backgroundColor: project.color ?? '#3b82f6' }}
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-text-primary">{project.name}</h1>
          {project.description && (
            <p className="truncate text-sm text-text-tertiary">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            to={`/c/new?projectId=${project.projectId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />
            {localize('com_ui_project_start_chat')}
          </Link>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label={localize('com_ui_edit_project')}
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-red-500"
            aria-label={localize('com_ui_delete_project')}
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="flex border-b border-border-light">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-green-600 text-text-primary'
                : 'border-transparent text-text-tertiary hover:text-text-secondary',
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'chats' && (
          <ProjectChatsTab projectId={project.projectId} />
        )}
        {activeTab === 'instructions' && (
          <ProjectInstructionsTab
            instructions={project.instructions ?? ''}
            onSave={handleSaveInstructions}
            isPending={updateMutation.isLoading}
          />
        )}
        {activeTab === 'memory' && (
          <ProjectMemoryTab
            memory={project.memory ?? []}
            onAdd={handleAddMemory}
            onRemove={handleRemoveMemory}
          />
        )}
      </div>

      <ProjectDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
      />
    </div>
  );
}

function ProjectChatsTab({ projectId }: { projectId: string }) {
  const localize = useLocalize();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <MessageSquare className="h-12 w-12 text-text-tertiary" />
      <p className="text-sm text-text-tertiary">{localize('com_ui_project_no_chats')}</p>
      <Link
        to={`/c/new?projectId=${projectId}`}
        className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
      >
        <Plus className="h-4 w-4" />
        {localize('com_ui_project_start_chat')}
      </Link>
    </div>
  );
}

function ProjectInstructionsTab({
  instructions: initialInstructions,
  onSave,
  isPending,
}: {
  instructions: string;
  onSave: (instructions: string) => void;
  isPending: boolean;
}) {
  const localize = useLocalize();
  const [instructions, setInstructions] = useState(initialInstructions);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="text-sm text-text-tertiary">
        {localize('com_ui_project_instructions_placeholder')}
      </p>
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={12}
        maxLength={50000}
        className="resize-y rounded-lg border border-border-medium bg-surface-secondary px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-green-500 focus:outline-none"
        placeholder={localize('com_ui_project_instructions_placeholder')}
      />
      <div className="flex justify-end">
        <Button
          onClick={() => onSave(instructions)}
          disabled={isPending || instructions === initialInstructions}
        >
          {isPending ? <Spinner className="h-4 w-4" /> : localize('com_ui_save')}
        </Button>
      </div>
    </div>
  );
}

function ProjectMemoryTab({
  memory,
  onAdd,
  onRemove,
}: {
  memory: TProjectMemoryEntry[];
  onAdd: (entry: TProjectMemoryEntry) => void;
  onRemove: (index: number) => void;
}) {
  const localize = useLocalize();

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">
          {localize('com_ui_project_memory')}
        </h3>
      </div>
      <AddMemoryForm onAdd={onAdd} />
      {memory.length === 0 && (
        <p className="py-4 text-center text-sm text-text-tertiary">
          No project context entries yet
        </p>
      )}
      <div className="flex flex-col gap-2">
        {memory.map((entry, index) => (
          <MemoryEntry
            key={`${entry.key}-${index}`}
            entry={entry}
            onRemove={() => onRemove(index)}
          />
        ))}
      </div>
    </div>
  );
}
