import React, { useEffect, useMemo, useState } from 'react';
import { Button, Spinner, useToastContext } from '@librechat/client';
import { AlertTriangle, CheckCircle2, RefreshCw, Send } from 'lucide-react';
import {
  ProjectsApiError,
  useHarveyProjects,
  useHarveyRefresh,
  useHarveySync,
} from '~/data-provider/Projects';
import type { HarveyProject, HarveySyncStatus, ProjectDetail } from '~/data-provider/Projects';

/**
 * 프로젝트 문서를 Harvey 프로젝트로 보내는 패널.
 *
 * 우리가 Harvey 쪽 프로젝트를 만들지 않는다. 사용자가 Harvey 에서 이미 접근
 * 가능한 프로젝트 중 하나를 골라야 하고, 권한은 BKL 중간 API 가 로그인 이메일로
 * 판정한다. 그래서 이 패널의 첫 역할은 "어디로 보낼지" 고르게 하는 것이다.
 *
 * 전송은 서버가 202 로 받고 백그라운드에서 돈다 — 업로드가 Harvey 조직 합산
 * 분당 10회 한도를 타서 문서가 많으면 수 분이 걸린다. 버튼은 "시작"만 담당하고
 * 진행 상황은 useProject 의 폴링이 갱신하는 status/진행률로 보여준다.
 */
const HarveySyncPanel: React.FC<{ project: ProjectDetail }> = ({ project }) => {
  const { showToast } = useToastContext();
  const harveySync = useHarveySync();
  const harveyRefresh = useHarveyRefresh();
  const harveyProjects = useHarveyProjects();
  const [pickedId, setPickedId] = useState<string>('');

  // 다른 BKL 프로젝트로 넘어가면 이전에 고른 대상은 무의미하다.
  useEffect(() => {
    setPickedId('');
  }, [project.project_id]);

  const status = project.harvey_sync_status ?? null;
  const total = project.document_count;
  const done = project.harvey_synced_count ?? 0;
  const isSyncing = status === 'syncing' || harveySync.isLoading;

  const options = useMemo<HarveyProject[]>(() => harveyProjects.data ?? [], [harveyProjects.data]);
  const storedId = project.harvey_vault_id ?? null;
  const storedInList = storedId != null && options.some((o) => o.project_id === storedId);

  // 사용자가 고른 게 우선. 없으면 이미 연결된 프로젝트가 목록에 있을 때 그걸로.
  const effectiveId = pickedId || (storedInList ? storedId : '') || '';
  const target: HarveyProject | undefined = useMemo(
    () => options.find((o) => o.project_id === effectiveId),
    [options, effectiveId],
  );

  // 연결돼 있던 프로젝트가 목록에서 사라졌다 — 권한 회수 또는 예전 방식으로
  // 만든 vault. 다른 대상을 골라야 한다는 걸 알려준다.
  const storedMissing =
    storedId != null && !storedInList && harveyProjects.isSuccess && options.length > 0;
  const retargeting = Boolean(target) && storedId != null && effectiveId !== storedId && done > 0;

  const listError = harveyProjects.error;
  const listErrorStatus = listError instanceof ProjectsApiError ? listError.status : null;

  const canSend = !isSyncing && total > 0 && Boolean(target?.can_upload);

  const handleSync = async () => {
    if (!target) {
      return;
    }
    try {
      await harveySync.mutateAsync({
        projectId: project.project_id,
        harveyProjectId: target.project_id,
        harveyProjectName: target.project_name,
      });
      showToast({
        message: `Harvey '${target.project_name}'으로 전송을 시작했습니다`,
        status: 'success',
      });
    } catch (e) {
      // 503=미설정, 409=이미 진행 중, 400=대상/이메일. 원문 detail 이 한국어라 그대로 쓴다.
      const detail = e instanceof Error ? e.message : String(e);
      const code = e instanceof ProjectsApiError ? e.status : null;
      showToast({
        message: code === 503 ? `Harvey 연동이 아직 설정되지 않았습니다 — ${detail}` : detail,
        status: 'error',
      });
    }
  };

  const handleRefresh = async () => {
    try {
      const r = await harveyRefresh.mutateAsync();
      showToast({
        message:
          r.projects_processed != null
            ? `Harvey 프로젝트 목록을 갱신했습니다 (${r.projects_processed}건 반영)`
            : 'Harvey 프로젝트 목록을 갱신했습니다',
        status: 'success',
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      showToast({ message: detail, status: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-border-light bg-surface-secondary px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5 text-xs">
            <StatusLine
              isSyncing={isSyncing}
              status={status}
              done={done}
              total={total}
              targetName={project.harvey_vault_name ?? target?.project_name ?? null}
              syncedAt={project.harvey_synced_at ?? null}
            />
          </div>

          {project.harvey_sync_error && !isSyncing && (
            <p className="truncate text-[11px] leading-relaxed text-text-tertiary">
              {project.harvey_sync_error}
              {status === 'error' && (
                <>
                  {' '}
                  — Harvey에서 이 프로젝트의 업로드 권한을 확인하거나 다른 프로젝트를 선택하세요.
                </>
              )}
            </p>
          )}
        </div>

        <TargetPicker
          options={options}
          value={effectiveId}
          onChange={setPickedId}
          disabled={isSyncing}
          isLoading={harveyProjects.isLoading}
          errorStatus={listErrorStatus}
          errorMessage={listError?.message ?? null}
        />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 rounded-md p-0"
          title="Harvey에서 방금 만든 프로젝트가 보이지 않으면 목록을 갱신합니다"
          aria-label="Harvey 프로젝트 목록 새로고침"
          disabled={harveyRefresh.isLoading || listErrorStatus === 503}
          onClick={handleRefresh}
        >
          {harveyRefresh.isLoading ? (
            <Spinner className="size-3.5" />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden="true" />
          )}
        </Button>

        <Button
          type="button"
          variant={status === 'synced' ? 'outline' : 'default'}
          size="sm"
          className="h-7 shrink-0 gap-1.5 rounded-md px-2.5 text-xs"
          disabled={!canSend}
          onClick={handleSync}
        >
          {isSyncing ? (
            <Spinner className="size-3.5" />
          ) : (
            <Send className="size-3.5" aria-hidden="true" />
          )}
          {buttonLabel(isSyncing, status, retargeting)}
        </Button>
      </div>

      {storedMissing && !isSyncing && (
        <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-500">
          <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
          이전에 보냈던 Harvey 프로젝트
          {project.harvey_vault_name ? ` '${project.harvey_vault_name}'` : ''}에 더 이상 접근할 수
          없습니다. 다른 프로젝트를 선택하세요.
        </p>
      )}

      {retargeting && !isSyncing && (
        <p className="text-[11px] text-text-tertiary">
          대상을 바꾸면 이미 보낸 {done}건을 포함해 전체 {total}건을 새 프로젝트에 다시 올립니다.
        </p>
      )}

      {harveyProjects.isSuccess && options.length === 0 && (
        <p className="text-[11px] text-text-tertiary">
          접근 가능한 Harvey 프로젝트가 없습니다. Harvey에서 프로젝트를 만들거나 공유받은 뒤
          새로고침하세요.
        </p>
      )}
    </div>
  );
};

const TargetPicker: React.FC<{
  options: HarveyProject[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
  isLoading: boolean;
  errorStatus: number | null;
  errorMessage: string | null;
}> = ({ options, value, onChange, disabled, isLoading, errorStatus, errorMessage }) => {
  if (isLoading) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
        <Spinner className="size-3.5" /> Harvey 프로젝트 불러오는 중
      </span>
    );
  }

  if (errorStatus != null) {
    const text = listErrorText(errorStatus, errorMessage);
    return (
      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
        <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
        {text}
      </span>
    );
  }

  return (
    <select
      aria-label="전송할 Harvey 프로젝트"
      className="h-7 max-w-[260px] shrink-0 truncate rounded-md border border-border-medium bg-surface-primary px-2 text-xs text-text-primary disabled:opacity-60"
      value={value}
      disabled={disabled || options.length === 0}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Harvey 프로젝트 선택</option>
      {options.map((o) => (
        <option key={o.project_id} value={o.project_id} disabled={!o.can_upload}>
          {o.project_name}
          {o.can_upload ? '' : ' (업로드 불가)'}
        </option>
      ))}
    </select>
  );
};

function listErrorText(status: number, message: string | null): string {
  if (status === 503) {
    return 'Harvey 연동이 아직 설정되지 않았습니다';
  }
  if (status === 400) {
    return '로그인 이메일을 확인할 수 없어 Harvey 프로젝트를 조회하지 못했습니다';
  }
  return message || 'Harvey 프로젝트를 불러오지 못했습니다';
}

function buttonLabel(
  isSyncing: boolean,
  status: HarveySyncStatus | null,
  retargeting: boolean,
): string {
  if (isSyncing) {
    return '전송 중';
  }
  if (retargeting) {
    return '새 프로젝트로 보내기';
  }
  if (status === 'partial' || status === 'error') {
    return '다시 시도';
  }
  if (status === 'synced') {
    return '다시 보내기';
  }
  return 'Harvey로 보내기';
}

const StatusLine: React.FC<{
  isSyncing: boolean;
  status: HarveySyncStatus | null;
  done: number;
  total: number;
  targetName: string | null;
  syncedAt: string | null;
}> = ({ isSyncing, status, done, total, targetName, syncedAt }) => {
  const where = targetName ? `Harvey '${targetName}'` : 'Harvey';

  if (isSyncing) {
    return (
      <>
        <Spinner className="size-3.5 shrink-0" />
        <span className="text-text-primary">
          {where}로 보내는 중{total > 0 ? ` (${done}/${total})` : ''}
        </span>
      </>
    );
  }

  if (status === 'synced') {
    return (
      <>
        <CheckCircle2
          className="size-3.5 shrink-0 text-green-600 dark:text-green-500"
          aria-hidden="true"
        />
        <span className="text-text-primary">
          {where}에 {done}건 전송 완료
        </span>
        {syncedAt && <span className="text-text-tertiary">· {formatDateTime(syncedAt)}</span>}
      </>
    );
  }

  if (status === 'partial' || status === 'error') {
    return (
      <>
        <AlertTriangle
          className="size-3.5 shrink-0 text-amber-600 dark:text-amber-500"
          aria-hidden="true"
        />
        <span className="text-text-primary">
          {status === 'partial'
            ? `${where}에 ${done}/${total}건 전송 — 일부가 남았습니다`
            : `${where} 전송에 실패했습니다`}
        </span>
      </>
    );
  }

  return (
    <span className="text-text-secondary">
      담은 문서를 내 Harvey 프로젝트로 보내 Harvey에서 이어서 검토할 수 있습니다.
    </span>
  );
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}`;
}

export default HarveySyncPanel;
