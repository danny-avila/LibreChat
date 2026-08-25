import React, { useCallback, useEffect, useState } from 'react';
import { useRecoilValue, useRecoilState, useSetRecoilState } from 'recoil';
import { ChevronDown, ChevronRight, ExternalLink, X } from 'lucide-react';
import { Button } from '@librechat/client';
import store from '~/store';
import { cn, FileTypeIcon } from '~/utils';
import BklSourcesPanel from '~/components/Chat/Messages/Content/BklSourcesPanel';
import type { BklSource } from '~/components/Chat/Messages/Content/ChunkModal';
import {
  useConversationCitations,
  type CitedTurn,
  type MentionedFile,
} from './useConversationCitations';

/**
 * 대화 단위 우측 패널 (mentat ThreadPanel 스타일).
 *
 * Overview(언급된 파일 / 인용된 청크 2개 접이식 섹션) ↔ 청크 텍스트 뷰의
 * 2상태로 동작한다. 청크 뷰는 기존 BklSourcesPanel 을 그대로 재사용하되,
 * 패널이 핀 고정(bklPanelOpen)된 상태에선 뒤로가기로 Overview 에 복귀한다.
 *
 * Presentation.tsx 가 SidePanelGroup 의 아티팩트 슬롯에 이 컴포넌트를
 * 라우팅하므로 리사이즈·모바일 동작은 아티팩트 패널과 동일하다.
 */
export default function BklThreadPanel() {
  const active = useRecoilValue(store.activeBklSource);
  const setActive = useSetRecoilState(store.activeBklSource);
  const [panelOpen, setPanelOpen] = useRecoilState(store.bklPanelOpen);

  // 청크 뷰 — [N] 클릭(패널 미고정)과 Overview 행 클릭(패널 고정) 모두 이 경로.
  if (active != null) {
    return (
      <BklSourcesPanel
        onBack={panelOpen ? () => setActive(null) : undefined}
        onCloseAll={panelOpen ? () => setPanelOpen(false) : undefined}
      />
    );
  }

  return <ThreadOverview onClose={() => setPanelOpen(false)} />;
}

function ThreadOverview({ onClose }: { onClose: () => void }) {
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const conversationId = conversation?.conversationId;
  const { turns, files, isLoading } = useConversationCitations(conversationId);
  const setActive = useSetRecoilState(store.activeBklSource);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const openChunk = useCallback(
    (messageId: string, n: number) => setActive({ messageId, n }),
    [setActive],
  );

  const isEmpty = turns.length === 0 && files.length === 0;

  return (
    <div className="flex h-full w-full flex-col bg-surface-primary text-text-primary shadow-2xl">
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border-light bg-surface-primary-alt px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wider text-text-secondary">
            대화 자료
          </div>
          <h2 className="mt-0.5 truncate text-sm font-semibold text-text-primary">
            인용된 출처 모아보기
          </h2>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="닫기">
          <X size={16} aria-hidden="true" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <p className="px-4 py-6 text-sm text-text-secondary">
            {isLoading
              ? '출처를 불러오는 중…'
              : '아직 인용된 출처가 없습니다. 답변 본문에 [N] 으로 인용된 문서와 청크가 여기에 쌓입니다.'}
          </p>
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
