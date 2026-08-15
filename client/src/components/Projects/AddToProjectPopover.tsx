import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Folder, Plus, Check } from 'lucide-react';
import { Spinner, useToastContext } from '@librechat/client';
import {
  useProjects,
  useCreateProject,
  useAddProjectDocuments,
} from '~/data-provider/Projects';
import type { AddDocumentsResult, ProjectDocumentInput } from '~/data-provider/Projects';

/**
 * BKL: '프로젝트에 담기' 공용 팝오버.
 * 채팅 출처 패널·문서 검색 다중 선택 양쪽에서 트리거를 children 으로 감싸 사용.
 * 프로젝트 목록에서 하나를 고르면 documents 를 벌크 추가하고, 하단 인라인
 * 입력으로 새 프로젝트를 만든 뒤 바로 담을 수 있다.
 */
export default function AddToProjectPopover({
  documents,
  children,
  onAdded,
  align = 'end',
}: {
  documents: ProjectDocumentInput[];
  children: React.ReactNode;
  onAdded?: (projectName: string, result: AddDocumentsResult) => void;
  align?: 'start' | 'center' | 'end';
}) {
  const { showToast } = useToastContext();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);

  const { data: projects = [], isLoading } = useProjects();
  const createProject = useCreateProject();
  const addDocuments = useAddProjectDocuments();

  const validDocs = useMemo(
    () => documents.filter((d) => d.doc_id && d.doc_id.trim().length > 0),
    [documents],
  );

  const handleAdd = async (projectId: string, projectName: string) => {
    if (validDocs.length === 0 || busyProjectId != null) {
      return;
    }
    setBusyProjectId(projectId);
    try {
      const result = await addDocuments.mutateAsync({ projectId, documents: validDocs });
      const dupNote = result.skipped > 0 ? ` (중복 ${result.skipped}건 제외)` : '';
      showToast({
        message: `${result.added}건을 '${projectName}'에 담았습니다${dupNote}`,
        status: result.added > 0 ? 'success' : 'info',
      });
      onAdded?.(projectName, result);
      setOpen(false);
    } catch (e) {
      showToast({
        message: `프로젝트에 담지 못했습니다: ${e instanceof Error ? e.message : String(e)}`,
        status: 'error',
      });
    } finally {
      setBusyProjectId(null);
    }
  };

  const handleCreateAndAdd = async () => {
    const name = newName.trim();
    if (!name || createProject.isLoading) {
      return;
    }
    try {
      const project = await createProject.mutateAsync({ name });
      setNewName('');
      setCreating(false);
      await handleAdd(project.project_id, project.name);
    } catch (e) {
      showToast({
        message: e instanceof Error ? e.message : String(e),
        status: 'error',
      });
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setCreating(false);
          setNewName('');
        }
      }}
    >
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          className="z-[100] w-72 rounded-xl border border-border-light bg-surface-primary p-2 shadow-lg"
        >
          <div className="px-2 py-1.5 text-xs font-medium text-text-secondary">
            {validDocs.length > 1 ? `${validDocs.length}건을 담을 프로젝트` : '담을 프로젝트'}
          </div>
          <div className="max-h-60 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner className="size-4" />
              </div>
            ) : projects.length === 0 ? (
              <div className="px-2 py-3 text-sm text-text-secondary">
                아직 프로젝트가 없습니다. 아래에서 새로 만들어 보세요.
              </div>
            ) : (
              projects.map((project) => (
                <button
                  key={project.project_id}
                  type="button"
                  disabled={busyProjectId != null}
                  onClick={() => handleAdd(project.project_id, project.name)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-text-primary hover:bg-surface-hover disabled:opacity-60"
                >
                  <Folder className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <span className="shrink-0 text-xs text-text-secondary">
                    {project.document_count}
                  </span>
                  {busyProjectId === project.project_id && <Spinner className="size-3.5" />}
                </button>
              ))
            )}
          </div>
          <div className="mt-1 border-t border-border-light pt-1">
            {creating ? (
              <div className="flex items-center gap-1 px-1 py-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateAndAdd();
                    }
                    if (e.key === 'Escape') {
                      setCreating(false);
                      setNewName('');
                    }
                  }}
                  placeholder="새 프로젝트 이름"
                  className="min-w-0 flex-1 rounded-md border border-border-medium bg-transparent px-2 py-1.5 text-sm text-text-primary outline-none focus:border-border-heavy"
                />
                <button
                  type="button"
                  onClick={handleCreateAndAdd}
                  disabled={!newName.trim() || createProject.isLoading}
                  aria-label="프로젝트 생성 후 담기"
                  className="rounded-md p-1.5 text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                >
                  {createProject.isLoading ? (
                    <Spinner className="size-4" />
                  ) : (
                    <Check className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-text-primary hover:bg-surface-hover"
              >
                <Plus className="size-4 text-text-secondary" aria-hidden="true" />새 프로젝트
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
