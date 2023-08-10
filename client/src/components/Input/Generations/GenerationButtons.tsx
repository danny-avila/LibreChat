import { cn } from '~/utils/';

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
        ></div>
      </div>
    </div>
  );
}
