import { type FC, useState } from 'react';
import { cn } from '~/utils';
import { Gem } from 'lucide-react';
import { useLocalize } from '~/hooks';
import SubscriptionModal from './SubscriptionModal';

type PricingNavProps = {
  isSmallScreen: boolean;
};

const PricingNav: FC<PricingNavProps> = ({ isSmallScreen }: PricingNavProps) => {
  const localize = useLocalize();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          'group relative mt-1 flex h-10 cursor-pointer items-center gap-3 rounded-lg border-border-medium bg-[#2f7ff7] px-3 py-2 text-white transition-colors duration-200',
          isSmallScreen ? 'mb-2 h-14 rounded-2xl' : '',
        )}
        onClick={() => setIsModalOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            setIsModalOpen(true);
          }
        }}
        aria-label={localize('com_ui_pricing_plans')}
      >
        <Gem className="absolute left-3 h-4 w-4 text-white group-focus-within:text-text-primary group-hover:text-text-primary" />
        <div className="m-0 mr-0 w-full border-none bg-transparent p-0 pl-7 text-sm leading-tight placeholder-text-secondary focus-visible:outline-none group-focus-within:placeholder-text-primary group-hover:placeholder-text-primary">
          {localize('com_ui_pricing_plans')}
        </div>
      </div>

      <SubscriptionModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </>
  );
};

export default PricingNav;
