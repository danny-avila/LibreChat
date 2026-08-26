/* eslint-disable i18next/no-literal-string */
/**
 * 개발 전용 하네스 — 2026-08-26 사용자 피드백 2건 검증.
 *
 * 1. PDF 내보내기 빈 화면: html-to-image 가 캡처 대상 노드의 인라인
 *    위치 스타일(fixed, -10000px)까지 복제해 빈 캔버스가 나오는 버그를
 *    구(舊)/신(新) 방식으로 나란히 캡처해 비교한다.
 * 2. 북마크 관리 다이얼로그: BookmarkMenu 에 새로 노출한 관리 다이얼로그
 *    (BookmarkPanel — 수정·삭제 버튼 포함)를 렌더해 확인한다.
 *
 * 사용: `npm run dev` 후 http://localhost:3090/export-harness.html
 */
import 'regenerator-runtime/runtime';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RecoilRoot } from 'recoil';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { toCanvas } from 'html-to-image';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { OGDialog, OGDialogTemplate } from '@librechat/client';
import '../locales/i18n';
import '../style.css';
import BookmarkPanel from '~/components/SidePanel/Bookmarks/BookmarkPanel';

// ── 1. PDF 캡처 검증 ─────────────────────────────────────────────────

function buildConversationNode(): HTMLDivElement {
  const container = document.createElement('div');
  container.style.width = '794px';
  container.style.boxSizing = 'border-box';
  container.style.padding = '48px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#111827';
  container.style.fontFamily =
    "'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', 'Segoe UI', system-ui, sans-serif";
  container.style.fontSize = '14px';
  container.style.lineHeight = '1.6';

  const title = document.createElement('h1');
  title.textContent = '계약서 검토 대화 (PDF 내보내기 테스트)';
  title.style.fontSize = '22px';
  container.appendChild(title);

  for (const [sender, text] of [
    ['사용자', '손해배상 조항을 검토해줘.'],
    [
      'BKL AI',
      '계약서 제5조에 따르면 [1] 손해배상 책임이 발생합니다. 위약벌 조항과의 관계는 [2]를 참고하세요.',
    ],
  ]) {
    const block = document.createElement('div');
    block.style.marginBottom = '20px';
    const s = document.createElement('div');
    s.textContent = sender;
    s.style.fontWeight = '600';
    block.appendChild(s);
    const b = document.createElement('div');
    b.textContent = text;
    block.appendChild(b);
    container.appendChild(block);
  }
  return container;
}

function nonWhiteRatio(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return -1;
  }
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let nonWhite = 0;
  const total = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
      nonWhite += 1;
    }
  }
  return nonWhite / total;
}

/** 구 방식: 캡처 대상 노드 자체에 fixed + (-10000px) 인라인 스타일 */
async function captureOldWay(): Promise<HTMLCanvasElement> {
  const node = buildConversationNode();
  node.style.position = 'fixed';
  node.style.top = '-10000px';
  node.style.left = '-10000px';
  document.body.appendChild(node);
  try {
    return await toCanvas(node, { backgroundColor: '#ffffff', pixelRatio: 1 });
  } finally {
    document.body.removeChild(node);
  }
}

/** 신 방식: 위치 스타일은 래퍼에만 — 캡처 대상 노드는 깨끗하게 유지 */
async function captureNewWay(): Promise<HTMLCanvasElement> {
  const node = buildConversationNode();
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.top = '-10000px';
  wrapper.style.left = '-10000px';
  wrapper.appendChild(node);
  document.body.appendChild(wrapper);
  try {
    return await toCanvas(node, { backgroundColor: '#ffffff', pixelRatio: 1 });
  } finally {
    document.body.removeChild(wrapper);
  }
}

function PdfCaptureTest() {
  const oldRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState('실행 중…');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) {
      return;
    }
    ran.current = true;
    (async () => {
      const oldCanvas = await captureOldWay();
      const newCanvas = await captureNewWay();
      const oldRatio = nonWhiteRatio(oldCanvas);
      const newRatio = nonWhiteRatio(newCanvas);
      for (const c of [oldCanvas, newCanvas]) {
        c.style.width = '397px';
        c.style.border = '1px solid #d1d5db';
      }
      oldRef.current?.appendChild(oldCanvas);
      newRef.current?.appendChild(newCanvas);
      const oldBlank = oldRatio < 0.001;
      const newHasContent = newRatio > 0.005;
      setResult(
        `구 방식 non-white ${(oldRatio * 100).toFixed(3)}% (${oldBlank ? '빈 화면 재현됨' : '재현 안 됨'})` +
          ` / 신 방식 non-white ${(newRatio * 100).toFixed(3)}% (${newHasContent ? '내용 있음' : '빈 화면'})` +
          ` → ${oldBlank && newHasContent ? 'PASS' : 'FAIL'}`,
      );
    })();
  }, []);

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-base font-semibold">1. PDF 캡처 (구 vs 신)</h2>
      <div id="pdf-test-result" className="mb-3 font-mono text-sm">
        {result}
      </div>
      <div className="flex gap-4">
        <div>
          <div className="mb-1 font-mono text-xs">구 방식 (fixed -10000px 를 노드에 직접)</div>
          <div ref={oldRef} />
        </div>
        <div>
          <div className="mb-1 font-mono text-xs">신 방식 (위치 스타일은 래퍼에만)</div>
          <div ref={newRef} />
        </div>
      </div>
    </section>
  );
}

// ── 2. 북마크 관리 다이얼로그 ────────────────────────────────────────

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
client.setQueryData(
  [QueryKeys.conversationTags],
  [
    { _id: 't1', tag: '중요 사건', description: '즉시 확인 필요', position: 0, count: 3 },
    { _id: 't2', tag: '계약 검토', description: '', position: 1, count: 7 },
    { _id: 't3', tag: '판례 조사', description: '리서치용', position: 2, count: 1 },
  ],
);

function BookmarkManageDialogPreview() {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold">
        2. 북마크 관리 다이얼로그 (연필=수정 / 휴지통=삭제)
      </h2>
      <RecoilRoot>
        <QueryClientProvider client={client}>
          <DndProvider backend={HTML5Backend}>
            <OGDialog open onOpenChange={() => undefined}>
              <OGDialogTemplate
                title="북마크 관리"
                className="w-11/12 md:max-w-lg"
                showCloseButton={true}
                main={<BookmarkPanel />}
                selection={undefined}
              />
            </OGDialog>
          </DndProvider>
        </QueryClientProvider>
      </RecoilRoot>
    </section>
  );
}

function Harness() {
  return (
    <div className="min-h-screen bg-surface-secondary p-6 text-text-primary">
      <h1 className="mb-4 text-lg font-semibold">내보내기·북마크 수정 검증 하네스</h1>
      <PdfCaptureTest />
      <BookmarkManageDialogPreview />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
