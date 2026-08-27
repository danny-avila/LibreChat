/* eslint-disable i18next/no-literal-string */
/**
 * 개발 전용 하네스 — 2026-08-26 "사이드바·라이브러리 필터·표시 개선" 검증.
 *
 * 1. 채팅 FilterDropdown: 상단 "검색 범위" 라이브러리 세그먼트 (전체/사건 문서/지식 DB)
 * 2. 문서 검색 FilterBar: 동일 세그먼트 pill
 * 3. ResultCard: 지식DB 배지 + 파일명 `.pdf.md → .pdf` 표시 스트립
 *
 * 사용: `npm run dev` 후 http://localhost:3090/feature-harness.html
 */
import 'regenerator-runtime/runtime';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../locales/i18n';
import '../style.css';
import FilterDropdown from '~/components/Chat/Input/FilterDropdown';
import FilterBar, { EMPTY_DOC_FILTERS } from '~/components/DocumentSearch/FilterBar';
import type { DocumentSearchFilterState } from '~/components/DocumentSearch/FilterBar';
import ResultCard from '~/components/DocumentSearch/ResultCard';
import type { DocumentHit } from '~/data-provider/DocumentSearch';
import { stripDisplayExtension } from '~/utils/fileTypeIcon';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 font-mono text-xs text-text-secondary">{title}</h2>
      <div className="rounded-lg border border-border-medium bg-surface-primary p-4">
        {children}
      </div>
    </section>
  );
}

function makeHit(over: Partial<DocumentHit>): DocumentHit {
  return {
    doc_id: 'doc-1',
    file_name: '계약서.pdf',
    imanage_create_date: '2025-11-11',
    document_date: null,
    matter_uid: '282290',
    client_name: '테스트 의뢰인',
    workspace_class: null,
    file_extension: 'pdf',
    work_type: null,
    document_type: null,
    practice_area_primary: null,
    score: 12.3,
    chunk_count: 4,
    title_match: false,
    top_chunks: [
      {
        chunk_id: 'c1',
        content: '이 사건 계약서 제5조에 따르면 손해배상 책임이 발생한다.',
        snippet: '이 사건 계약서 제5조에 따르면 손해배상 책임이 발생한다.',
        section: null,
        chunk_index: 0,
        page_start: 2,
        page_end: 3,
        score: 11.1,
      },
    ],
    ...over,
  } as DocumentHit;
}

function DocFilterBarDemo() {
  const [filters, setFilters] = useState<DocumentSearchFilterState>(EMPTY_DOC_FILTERS);
  return (
    <div className="flex flex-col gap-2">
      <FilterBar value={filters} onChange={setFilters} />
      <div className="font-mono text-xs text-text-secondary">
        state.library = {JSON.stringify(filters.library)}
      </div>
    </div>
  );
}

function Harness() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-lg font-semibold text-text-primary">
        Feature Harness — 라이브러리 필터 / .md 스트립
      </h1>

      <Section title="1. 채팅 FilterDropdown (버튼 클릭 → 아래로 펼침 + 닫기 버튼)">
        <div className="flex items-start gap-3">
          <FilterDropdown />
          {/* 채팅 입력창 대역 — 여기 클릭/포커스 시 패널이 닫혀야 한다 */}
          <textarea
            id="fake-prompt-textarea"
            placeholder="채팅 입력창 (클릭하면 필터 패널이 닫혀야 함)"
            className="h-11 flex-1 rounded-xl border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary"
            onPointerDown={(e) => e.stopPropagation()}
          />
        </div>
      </Section>

      <Section title="2. 문서 검색 FilterBar (라이브러리 세그먼트)">
        <DocFilterBarDemo />
      </Section>

      <Section title="3. ResultCard — 사건 문서(M) vs 지식DB(DB 배지 + .md 스트립)">
        <ResultCard hit={makeHit({})} query="계약서" />
        <ResultCard
          hit={makeHit({
            doc_id: 'doc-2',
            file_name: '중재법 개정 참고자료집.pdf.md',
            matter_uid: 'DBLIB_001',
            source_library: 'DB',
          })}
          query="중재법"
        />
      </Section>

      <Section title="4. stripDisplayExtension 단위 확인">
        <ul className="font-mono text-xs text-text-primary">
          {['계약서.pdf.md', '메일.msg.md', 'note.md', '자료집.PDF.MD', '이름만'].map((n) => (
            <li key={n}>
              {n} → {stripDisplayExtension(n)}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <RecoilRoot>
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  </RecoilRoot>,
);
