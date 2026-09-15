import React from 'react';
import { Button, Spinner, useToastContext } from '@librechat/client';
import { AlertTriangle, CheckCircle2, Send, Users } from 'lucide-react';
import { ProjectsApiError, useHarveySync } from '~/data-provider/Projects';
import type { HarveySyncStatus, ProjectDetail } from '~/data-provider/Projects';

/**
 * 프로젝트를 Harvey Vault 로 보내는 패널.
 *
 * 전송은 서버가 202 로 받고 백그라운드에서 돈다 — 조직 합산 분당 10회 레이트
 * 리밋 때문에 문서가 많으면 수 분이 걸린다. 그래서 버튼은 "시작"만 담당하고
 * 진행 상황은 useProject 의 폴링이 갱신하는 status/진행률로 보여준다.
 *
 * vault 는 Harvey 서비스 계정 소유로 만들어지고, 로그인한 사용자 이메일로
 * 자동 공유된다. 공유가 실패하는 가장 흔한 원인은 그 주소에 Harvey 계정이
 * 없는 것이라서, 전송 성공과 공유 결과를 따로 보여준다.
 */
const HarveySyncPanel: React.FC<{ project: ProjectDetail }> = ({ project }) => {
  const { showToast } = useToastContext();
  const harveySync = useHarveySync();

  const status = project.harvey_sync_status ?? null;
  const total = project.document_count;
  const done = project.harvey_synced_count ?? 0;
  const isSyncing = status === 'syncing' || harveySync.isLoading;
  const shared = project.harvey_shared_emails ?? [];

  const handleSync = async () => {
    try {
      await harveySync.mutateAsync({ projectId: project.project_id });
      showToast({ message: 'Harvey로 전송을 시작했습니다', status: 'success' });
    } catch (e) {
      // 503=토큰 미설정, 409=이미 진행 중. 원문 detail 이 이미 한국어라 그대로 쓴다.
      const detail = e instanceof Error ? e.message : String(e);
      const status = e instanceof ProjectsApiError ? e.status : null;
      showToast({
        message: status === 503 ? `Harvey 연동이 아직 설정되지 않았습니다 — ${detail}` : detail,
        status: 'error',
      });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-light bg-surface-secondary px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5 text-xs">
          <StatusLine
            isSyncing={isSyncing}
            status={status}
            done={done}
            total={total}
            syncedAt={project.harvey_synced_at ?? null}
          />
        </div>

        {project.harvey_sync_error && !isSyncing && (
          <p className="truncate text-[11px] leading-relaxed text-text-tertiary">
            {project.harvey_sync_error}
          </p>
        )}

        {shared.length > 0 && (
          <p className="flex items-center gap-1 text-[11px] text-text-tertiary">
            <Users className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{shared.join(', ')} 에게 공유됨</span>
          </p>
        )}
      </div>

      <Button
        type="button"
        variant={status === 'synced' ? 'outline' : 'default'}
        size="sm"
        className="h-7 shrink-0 gap-1.5 rounded-md px-2.5 text-xs"
        disabled={isSyncing || total === 0}
        onClick={handleSync}
      >
        {isSyncing ? (
          <Spinner className="size-3.5" />
        ) : (
          <Send className="size-3.5" aria-hidden="true" />
        )}
        {buttonLabel(isSyncing, status)}
      </Button>
    </div>
  );
};

function buttonLabel(isSyncing: boolean, status: HarveySyncStatus | null): string {
  if (isSyncing) {
    return '전송 중';
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
  syncedAt: string | null;
}> = ({ isSyncing, status, done, total, syncedAt }) => {
  if (isSyncing) {
    return (
      <>
        <Spinner className="size-3.5 shrink-0" />
        <span className="text-text-primary">
          Harvey로 보내는 중{total > 0 ? ` (${done}/${total})` : ''}
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
        <span className="text-text-primary">Harvey에 {done}건 전송 완료</span>
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
            ? `Harvey에 ${done}/${total}건 전송 — 일부가 남았습니다`
            : 'Harvey 전송에 실패했습니다'}
        </span>
      </>
    );
  }

  return (
    <span className="text-text-secondary">
      담은 문서를 Harvey Vault로 보내 Harvey에서 이어서 검토할 수 있습니다.
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
