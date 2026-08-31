/**
 * 개발 전용 하네스 — 우측 패널(청크 뷰 / Overview)을 여러 고정 폭으로
 * 나란히 렌더해 좁은 패널 레이아웃을 눈으로 검증한다.
 *
 * 사용: `npm run dev` 후 http://localhost:3090/harness.html
 * 프로덕션 번들(index.html 단일 엔트리)에는 포함되지 않는다.
 */
import 'regenerator-runtime/runtime';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { RecoilRoot } from 'recoil';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import '../locales/i18n';
import '../style.css';
import 'katex/dist/katex.min.css';
import store from '~/store';
import BklSourcesPanel from '~/components/Chat/Messages/Content/BklSourcesPanel';
import BklThreadPanel from '~/components/Chat/BklPanel/BklThreadPanel';

const CHUNK_TEXT = `양주시장은 2022. 7. 15. 이 사건 1구역 물류창고 건설을 담당한 신세계건설(이하 '이 사건 시공사'라고 합니다)이 양주시 소유의 공사부지 출입로를 무단으로 점용하였다는 이유로 공사중지명령(이하 '이 사건 중지명령'이라고 합니다)을 하였고(참고자료 2 공사중지통보), 연이어 2022. 8. 11. 민원대책 미비 등을 이유로 위 출입로에 대한 이 사건 시공사의 도로점용허가신청 및 공유재산사용허가신청을 반려(이하 '이 사건 도로점용허가신청 등 반려처분'이라고 합니다)하였습니다(참고자료 3의 1 도로점용허가신청 반려 통보, 참고자료 3의 2 공유재산사용허가신청 반려 통보).

이에 이 사건 시공사는 2022. 10. 17. 이 사건 도로점용허가신청 등 반려처분의 취소를 구하는 소를 제기하였습니다(참고자료 4 소장).

한편, 귀 원에서는 2022. 10. 11.부터 2023. 2. 3.까지 양주시 등 20개 기관에 대하여 "소극행정 개선 등 규제개혁 추진실태(1)" 감사를 실시하였는데, 감사 기간 중 양주시장의 이 사건 도로점용허가신청 등 반려처분의 위법·부당성에 대한 문제가 제기되자, 양주시장은 감사기간 중인 2022. 11. 28. 이 사건 시공사의 출입로 사용을 위한 도로점용허가 및 공유재산사용허가를 하면서, 2022. 12. 7. 이 사건 중지명령도 철회하였습니다.`;

function makeSource(n: number, fileName: string) {
  return {
    source: {
      imanage_url: 'https://example.com/file',
      imanage_folder_url: 'https://example.com/folder',
      bims_url: 'https://example.com/bims',
    },
    document: [CHUNK_TEXT],
    metadata: [
      {
        name: `『${fileName}』- [${n}]`,
        source: `chunk_${n}`,
        page_info: 'p.2-4',
        relevance: 0.96,
        section_kind: 'attachment',
        attachment_idx: 3,
        attachment_total: 4,
        attachment_filename: '감사제보서.pdf',
        doc_id: `doc-${n}`,
        file_type: 'pdf',
        matter_uid: 'M-1',
        edit_date: '2024-05-16T09:00:00',
        last_user: 'KIMJS',
        custom4: '양주시',
        custom1_description: '행정소송',
        custom29_description: '인허가',
      },
    ],
  };
}

const LONG_NAME = '(2024.05.16) 감사제보서, 위임장, 진술서 외 첨부자료 일체.pdf.md';
const SOURCES = [
  makeSource(1, '소장_최종본.docx'),
  makeSource(2, LONG_NAME),
  makeSource(3, LONG_NAME),
];

// Overview 용 전역 캐시 시딩 (API 는 dev 서버에서 404 → 폴백 경로 검증)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__bklSources = { m1: SOURCES };

function Frame({ w, label, children }: { w: number; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-mono text-xs text-text-secondary">
        {label} — {w}px
      </div>
      <div
        className="overflow-hidden rounded-lg border border-border-medium bg-surface-primary"
        style={{ width: w, height: 640 }}
      >
        {children}
      </div>
    </div>
  );
}

function ChunkViewAt({ w }: { w: number }) {
  return (
    <Frame w={w} label="청크 뷰">
      <RecoilRoot
        initializeState={({ set }) => {
          set(store.activeBklSource, { conversationId: 'c1', messageId: 'm1', n: 3 });
        }}
      >
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <BklSourcesPanel onBack={() => undefined} />
        </QueryClientProvider>
      </RecoilRoot>
    </Frame>
  );
}

function OverviewAt({ w }: { w: number }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(
    [QueryKeys.messages, 'c1'],
    [
      {
        messageId: 'u1',
        conversationId: 'c1',
        isCreatedByUser: true,
        text: '감사 관련 자료 정리해줘',
      },
      {
        messageId: 'm1',
        conversationId: 'c1',
        isCreatedByUser: false,
        text: '공사중지명령 경위는 다음과 같습니다 [1]. 반려처분 취소소송이 제기되었고 [2], 감사 기간 중 철회되었습니다 [3].',
      },
    ],
  );
  return (
    <Frame w={w} label="Overview">
      <RecoilRoot>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/c/c1']}>
            <Routes>
              <Route path="/c/:conversationId" element={<BklThreadPanel />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </RecoilRoot>
    </Frame>
  );
}

function Harness() {
  return (
    <div className="min-h-screen bg-surface-secondary p-6 text-text-primary">
      <h1 className="mb-4 text-lg font-semibold">BKL 우측 패널 하네스</h1>
      <div className="flex flex-wrap items-start gap-6">
        <ChunkViewAt w={300} />
        <ChunkViewAt w={360} />
        <ChunkViewAt w={480} />
        <OverviewAt w={300} />
        <OverviewAt w={420} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
