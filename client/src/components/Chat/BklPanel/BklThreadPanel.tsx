import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ChevronDown, ChevronRight, ExternalLink, FileText } from 'lucide-react';
import store from '~/store';
import { cn, FileTypeIcon } from '~/utils';
import BklSourcesPanel from '~/components/Chat/Messages/Content/BklSourcesPanel';
import type { BklSource } from '~/components/Chat/Messages/Content/ChunkModal';
import {
  useConversationCitations,
  type CitedTurn,
  type MentionedFile,
} from './useConversationCitations';
import { useOpenBklSource } from './useActiveBklSource';

/**
 * 대화 단위 우측 패널 (mentat ThreadPanel 스타일) — 데스크톱에선 항상 열려
 * 있다 (Presentation.tsx 가 아티팩트 슬롯에 상시 라우팅).
 *
 * Overview(언급된 파일 / 인용된 청크 2개 접이식 섹션) ↔ 청크 텍스트 뷰의
 * 2상태로 동작한다. 청크 뷰는 기존 BklSourcesPanel 을 재사용하고, 뒤로가기
 * 또는 닫기로 Overview 에 복귀한다.
 */
export default function BklThreadPanel() {
  const active = useRecoilValue(store.activeBklSource);
  const setActive = useSetRecoilState(store.activeBklSource);

  // 청크 뷰 — 본문 [N] 클릭과 Overview 행 클릭 모두 이 경로.
  if (active != null) {
    return <BklSourcesPanel onBack={() => setActive(null)} />;
  }

  return <ThreadOverview />;
}

function ThreadOverview() {
  // ChatView 와 동일하게 라우트 파라미터를 쓴다 — 메시지 쿼리 캐시 키가
  // 같아야 스트리밍 직후에도 같은 데이터를 본다.
  const { conversationId } = useParams();
  const { turns, files, isLoading } = useConversationCitations(conversationId);
  const openChunk = useOpenBklSource();

  const isEmpty = turns.length === 0 && files.length === 0;

  return (
    <div className="flex h-full w-full flex-col bg-surface-primary text-text-primary">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border-light bg-surface-primary-alt px-4 py-3">
        <h2 className="truncate text-sm font-semibold text-text-primary">대화 자료</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <FileText size={28} className="text-text-tertiary" aria-hidden="true" />
            {isLoading ? (
              <p className="text-sm text-text-secondary">출처를 불러오는 중…</p>
            ) : (
              <>
                <p className="text-sm font-medium text-text-primary">아직 인용된 출처가 없습니다</p>
                <p className="text-sm leading-relaxed text-text-secondary">
                  답변 본문에 인용된 문서와 청크가
                  <br />
                  여기에 정리됩니다.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <PanelSection label="언급된 파일" count={files.length} defaultOpen>
              {files.map((file) => (
                <FileRow key={file.key} file={file} />
              ))}
            </PanelSection>
            <PanelSection
              label="인용된 청크"
              count={turns.reduce((acc, t) => acc + t.chunks.length, 0)}
              defaultOpen
            >
              {turns.map((turn) => (
                <TurnGroup key={turn.messageId} turn={turn} onOpenChunk={openChunk} />
              ))}
            </PanelSection>
          </>
        )}
      </div>
    </div>
  );
}

/** mentat PanelSection 의 이식판 — 접이식 섹션 헤더 + 카운트 뱃지. */
function PanelSection({
  label,
  count,
  defaultOpen = false,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border-light">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary hover:bg-surface-hover"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown size={14} aria-hidden="true" />
        ) : (
          <ChevronRight size={14} aria-hidden="true" />
        )}
        <span className="flex-1">{label}</span>
        <span className="rounded bg-surface-secondary px-1.5 py-0.5 text-[11px] font-medium normal-case tracking-normal">
          {count}
        </span>
      </button>
      {open ? <div className="pb-1">{children}</div> : null}
    </div>
  );
}

function fileTypeExt(source: BklSource): string | null {
  const meta = source.metadata?.[0] as Record<string, unknown> | undefined;
  return typeof meta?.file_type === 'string' ? (meta.file_type as string) : null;
}

function FileRow({ file }: { file: MentionedFile }) {
  const rawName = String(
    file.sample.metadata?.[0]?.name ?? file.sample.metadata?.[0]?.file_name ?? file.fileName,
  );
  const clickable = Boolean(file.imanageUrl);
  const open = () => {
    if (file.imanageUrl) window.open(file.imanageUrl, '_blank', 'noopener');
  };
  return (
    <button
      type="button"
      onClick={open}
      disabled={!clickable}
      title={clickable ? `${file.fileName} — iManage 원문 열기` : file.fileName}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
        clickable ? 'hover:bg-surface-hover' : 'cursor-default',
      )}
    >
      <FileTypeIcon ext={fileTypeExt(file.sample)} name={rawName} className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-text-primary">{file.fileName}</span>
      <span className="rounded bg-surface-secondary px-1.5 py-0.5 text-[11px] text-text-secondary">
        {file.count}
      </span>
      {clickable ? (
        <ExternalLink size={13} className="shrink-0 text-text-tertiary" aria-hidden="true" />
      ) : null}
    </button>
  );
}

function TurnGroup({
  turn,
  onOpenChunk,
}: {
  turn: CitedTurn;
  onOpenChunk: (messageId: string, n: number) => void;
}) {
  return (
    <div>
      <div className="px-3 pb-0.5 pt-2 text-[11px] font-medium text-text-tertiary">
        답변 {turn.index}
      </div>
      {turn.chunks.map((chunk) => {
        const pageInfo = chunk.source.metadata?.[0]?.page_info;
        return (
          <button
            key={`${chunk.messageId}-${chunk.n}`}
            type="button"
            onClick={() => onOpenChunk(chunk.messageId, chunk.n)}
            title={chunk.fileName}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-hover"
          >
            <span className="shrink-0 rounded bg-surface-secondary px-1.5 py-0.5 text-[11px] font-semibold text-text-secondary">
              {chunk.n}
            </span>
            <span className="min-w-0 flex-1 truncate text-text-primary">{chunk.fileName}</span>
            {pageInfo ? (
              <span className="shrink-0 text-[11px] text-text-tertiary">{String(pageInfo)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
