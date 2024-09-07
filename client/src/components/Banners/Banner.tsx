import { XIcon } from 'lucide-react';
import { useRecoilState } from 'recoil';
import { useGetBannerQuery } from 'librechat-data-provider/react-query';
import store from '~/store';

export const Banner = () => {
  const { data: banner } = useGetBannerQuery();
  const [hideBannerHint, setHideBannerHint] = useRecoilState<string[]>(store.hideBannerHint);
  if (!banner) {
    return null;
  }

  if (banner.bannerId && hideBannerHint.includes(banner.bannerId)) {
    return null;
  }

  const onClick = () => {
    setHideBannerHint([...hideBannerHint, banner.bannerId]);
  };

  return (
    <div className="relative bg-black px-4 py-3 text-white">
      <div className="container mx-auto">
        <div className="flex items-center justify-between md:justify-center">
          <p className="text-sm" dangerouslySetInnerHTML={{ __html: banner.message }}></p>
          <button
            onClick={onClick}
            className="text-white transition-colors duration-200 hover:text-gray-300 md:absolute md:right-4"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
