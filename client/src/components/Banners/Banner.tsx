import { XIcon } from 'lucide-react';
import { useRecoilState } from 'recoil';
import { useGetBannerQuery } from 'librechat-data-provider/react-query';
import store from '~/store';
import { useEffect, useRef } from 'react';

export const Banner = ({ onHeightChange }: { onHeightChange?: (height: number) => void }) => {
  const { data: banner } = useGetBannerQuery();
  const [hideBannerHint, setHideBannerHint] = useRecoilState<string[]>(store.hideBannerHint);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (onHeightChange && bannerRef.current) {
      onHeightChange(bannerRef.current.offsetHeight);
    }
  }, [banner, hideBannerHint, onHeightChange]);

  if (!banner || (banner.bannerId && hideBannerHint.includes(banner.bannerId))) {
    return null;
  }

  const onClick = () => {
    setHideBannerHint([...hideBannerHint, banner.bannerId]);
    if (onHeightChange) {
      onHeightChange(0); // Reset height when banner is closed
    }
  };

  return (
    <div
      ref={bannerRef}
      className="sticky top-0 z-20 flex items-center bg-neutral-900 from-gray-700 to-gray-900 px-2 py-1 text-slate-50 dark:bg-gradient-to-r dark:text-white md:relative"
    >
      <div
        className="w-full truncate px-4 text-center text-sm"
        dangerouslySetInnerHTML={{ __html: banner.message }}
      ></div>
      <button
        type="button"
        aria-label="Dismiss banner"
        className="h-8 w-8 opacity-80 hover:opacity-100"
        onClick={onClick}
      >
        <XIcon className="mx-auto h-4 w-4" />
      </button>
    </div>
  );
};
