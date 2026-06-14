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
      <div className="mx-auto flex max-w-5xl items-start justify-between gap-3">
        <div>
          <span className="font-semibold">시범 서비스 안내</span>
          <span className="ml-2">
            bkl DB AI는 시범 운영 중입니다. 중요한 법률 판단에는 원문과 담당 변호사 검토를
            함께 확인해 주세요.
          </span>
        </div>
        <button
          type="button"
          aria-label="시범 서비스 안내 닫기"
          className="rounded p-0.5 text-amber-800 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/50"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default BklTopBanner;
