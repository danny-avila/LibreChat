import { cn, removeFocusOutlines } from '~/utils/';

type GenerationButtonsProps = {
  showPopover: boolean;
  opacityClass: string;
};

export default function GenerationButtons({ showPopover, opacityClass }: GenerationButtonsProps) {
  return (
    <div className="absolute bottom-4 right-0 z-[62]">
      <div className="grow"></div>
      <div className="flex items-center md:items-end">
        <div
          className={cn('option-buttons', showPopover ? '' : opacityClass)}
          data-projection-id="173"
        >
          {/* <button
            className={cn(
              'custom-btn btn-neutral relative -z-0 whitespace-nowrap border-0 md:border',
              removeFocusOutlines,
            )}
          >
            <div className="flex w-full items-center justify-center gap-2">
              <svg
                stroke="currentColor"
                fill="none"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3 flex-shrink-0"
                height="1em"
                width="1em"
                xmlns="http://www.w3.org/2000/svg"
              >
                <polyline points="1 4 1 10 7 10"></polyline>
                <polyline points="23 20 23 14 17 14"></polyline>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
              </svg>
              Regenerate
            </div>
          </button> */}
        </div>
      </div>
    </div>
  );
}
