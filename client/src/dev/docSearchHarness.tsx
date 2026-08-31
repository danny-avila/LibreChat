/* eslint-disable i18next/no-literal-string -- 개발 전용 하네스. 케이스
   라벨은 번역 대상이 아니고 프로덕션 번들에도 들어가지 않는다. */
/**
 * 개발 전용 하네스 — 문서 검색 페이지네이션 + 100건 초과 안내를 상태별로
 * 나란히 렌더해 눈으로 검증한다.
 *
 * 사용: `npm run dev` 후 http://localhost:3090/doc-search-harness.html
 * 프로덕션 번들(index.html 단일 엔트리)에는 포함되지 않는다.
 */
import 'regenerator-runtime/runtime';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RecoilRoot } from 'recoil';
import i18n from '../locales/i18n';
import '../style.css';

// LanguageDetector 는 navigator 를 먼저 보므로 en 으로 뜬다. 실제 앱은
// useLocalize 가 마운트 후 recoil lang('ko')로 바꾸는데, 이 작은 트리에서는
// 그 전환이 첫 페인트와 경합해 컴포넌트마다 언어가 갈린다. 하네스는 시각
// 검증이 목적이니 렌더 전에 확정해 둔다.
void i18n.changeLanguage('ko');
import { LimitNotice, Pagination } from '~/components/DocumentSearch/DocumentSearch';

const CAP = 100;

function Case({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border-light bg-surface-primary p-5">
      <p className="mb-1 text-sm font-semibold text-text-primary">{title}</p>
      {note && <p className="mb-3 text-xs text-text-secondary">{note}</p>}
      {children}
    </section>
  );
}

function LivePager({ totalPages }: { totalPages: number }) {
  const [page, setPage] = useState(1);
  return (
    <>
      <p className="mb-2 text-xs text-text-secondary">현재 {page} 페이지</p>
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </>
  );
}

function App() {
  const [dark, setDark] = useState(false);
  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-presentation p-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-text-primary">
              문서 검색 — 페이지네이션 / 초과 안내
            </h1>
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              className="rounded-md border border-border-light px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
            >
              {dark ? '라이트' : '다크'} 모드
            </button>
          </div>

          <Case title="초과 안내" note="상한에서 잘렸을 때만 뜬다">
            <LimitNotice cap={CAP} />
          </Case>

          <Case title="10페이지 (100건)" note="상한까지 찬 경우 — 버튼이 가장 많다">
            <LivePager totalPages={10} />
          </Case>

          <Case title="3페이지 (25건)">
            <LivePager totalPages={3} />
          </Case>

          <Case title="2페이지 (11건)" note="최소 노출 조건">
            <LivePager totalPages={2} />
          </Case>

          <Case title="1페이지 (10건 이하)" note="네비게이션이 통째로 사라져야 한다">
            <LivePager totalPages={1} />
            <p className="text-xs text-text-tertiary">↑ 아무것도 안 보이면 정상</p>
          </Case>
        </div>
      </div>
    </div>
  );
}

// useLocalize 가 recoil 상태(언어 설정)를 읽으므로 RecoilRoot 가 필요하다.
createRoot(document.getElementById('root')!).render(
  <RecoilRoot>
    <App />
  </RecoilRoot>,
);
