import { X } from 'lucide-react';
import { useRecoilState } from 'recoil';
import store from '~/store';

const BklTopBanner = () => {
  const [dismissed, setDismissed] = useRecoilState(store.topBannerDismissed);

  if (dismissed) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div>
          <span className="font-semibold block">bkl DB AI 시범 서비스 안내</span>
          <span className="block mt-1 leading-relaxed">
            현재 본 서비스는 초기 테스트 단계이며, 규제그룹 대상 2021.01.01 ~ 2026.04.30
            기간의 사건에 한해 검색이 제공됩니다. 그 외 자료는 검색 결과에서 누락될 수 있는
            점 양해 부탁드립니다.
          </span>
        </div>
        <button
          type="button"
          aria-label="시범 서비스 안내 닫기"
          className="inline-flex min-w-[44px] min-h-[44px] shrink-0 cursor-pointer items-center justify-center rounded p-3 text-amber-800 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/50"
          onClick={() => setDismissed(true)}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default BklTopBanner;
