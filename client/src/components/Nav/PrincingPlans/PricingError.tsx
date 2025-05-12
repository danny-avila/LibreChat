import { type FC, useState } from 'react';
import SubscriptionModal from './SubscriptionModal';

interface PricingErrorProps {
  message: string;
}

const PricingError: FC<PricingErrorProps> = ({ message }) => {
  const [isModalOpen, setIsModalOpen] = useState(true);

  const handleLinkClick = () => {
    setIsModalOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleLinkClick}
        className="font-inherit cursor-pointer border-none bg-transparent p-0 text-blue-600 underline hover:text-blue-800"
      >
        {message}
      </button>
      <SubscriptionModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </>
  );
};

export default PricingError;
