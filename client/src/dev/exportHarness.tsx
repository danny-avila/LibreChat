/* eslint-disable i18next/no-literal-string */
/**
 * 개발 전용 하네스 — PDF 내보내기(인쇄 문서) + 북마크 다이얼로그 검증.
 *
 * 1. PDF 내보내기 (2026-08-26 재작성): 마크다운 렌더링·인용 [N] 파일명 치환·
 *    본문 .md 스트립이 반영된 인쇄 문서 HTML 을 보이는 iframe 으로 렌더한다.
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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { OGDialog, OGDialogTemplate } from '@librechat/client';
import '../locales/i18n';
import '../style.css';
import BookmarkPanel from '~/components/SidePanel/Bookmarks/BookmarkPanel';
import { getBklDisplayText } from '~/utils';
import {
  buildPrintHtml,
  renderMarkdownToHtml,
  replaceCitationsWithFilenames,
} from '~/utils/exportPrint';
import type { BklSource } from '~/components/Chat/Messages/Content/ChunkModal';

// ── 1. PDF 인쇄 문서 프리뷰 ─────────────────────────────────────────

const SOURCES: BklSource[] = [
  { document: [''], metadata: [{ name: '『도로점용허가신청서 보완1차.hwp.md』 p.2' }] },
  { document: [''], metadata: [{ name: 'RE_ [법무법인(유한) 태평양] 접수증 송부.msg.md' }] },
  { document: [''], metadata: [{ name: '(2024_05_11)_지엘옥정_감사제보 별지.docx.md' }] },
];

const ASSISTANT_MD = `신세계건설의 경기도 양주시 관련 자료는 주로 **'양주옥정 물류센터 신축공사'** 사업 문서들이 다수 확인됩니다.

## 1. 양주옥정 물류센터 신축공사 관련 주요 자료

### 가. 도로점용허가 신청서 및 사업계획서
- **내용**: 신세계건설이 공사장 진출입로 조성을 위해 양주시에 제출한 서류입니다 [[1]](https://km.example/1).
- **행정처분**: 반려처분 취소 소송 제기 사실이 기재되어 있습니다 [2, 3].

## 검색 문서 리스트

| # | 날짜 | 파일명 | 인용 |
|---|------|--------|------|
| 1 | 2022년 10월 | 『도로점용허가신청서 보완1차.hwp.md』 | ○ |
| 2 | 2024년 6월 | RE_ [법무법인(유한) 태평양] 접수증 송부.msg.md | ○ |
| 3 | 2024년 5월 | (2024_05_11)_지엘옥정_감사제보 별지.docx.md | ○ |
`;

function PrintPreview() {
  const [html, setHtml] = useState('');
  useEffect(() => {
    (async () => {
      // 실제 exportPDF 경로와 동일한 변환 순서: 표시 텍스트 → 인용 치환 → 마크다운 렌더
      const userText = getBklDisplayText('신세계건설 양주시 관련 자료가 있나?');
      const asstText = replaceCitationsWithFilenames(getBklDisplayText(ASSISTANT_MD), SOURCES);
      const blocks = [
        { sender: 'User', isUser: true, html: await renderMarkdownToHtml(userText) },
        { sender: 'BKL DB AI', isUser: false, html: await renderMarkdownToHtml(asstText) },
      ];
      setHtml(
        buildPrintHtml({
          title: '신세계건설 양주시 자료 검색',
          documentTitle: '내보내기-미리보기',
          metaLines: ['대화 ID: harness-demo', `내보낸 시각: ${new Date().toLocaleString('ko-KR')}`],
          blocks,
        }),
      );
    })();
  }, []);

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-base font-semibold">
        1. PDF 인쇄 문서 프리뷰 (마크다운 렌더 · 인용 파일명 치환 · .md 스트립)
      </h2>
      <div className="mb-2 font-mono text-xs text-text-secondary">
        기대: 헤딩·표가 실제 렌더링 / [[1]](url)·[2, 3] → 『파일명』 / 표의 .hwp.md → .hwp
      </div>
      <iframe
        title="print-preview"
        srcDoc={html}
        style={{ width: 794, height: 720, border: '1px solid #d1d5db', background: '#fff' }}
      />
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
      <PrintPreview />
      <BookmarkManageDialogPreview />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
