import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '~/components';
import { useGetSubscriptionPlans } from 'librechat-data-provider/react-query';
import { useLocalize } from '~/hooks';
import SubscriptionDataTable from '~/components/Nav/SubscriptionDataTable';

interface SubscriptionViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SubscriptionView: React.FC<SubscriptionViewProps> = ({ open, onOpenChange }) => {
  const localize = useLocalize();
  const { data: serverPlans = [], isLoading, error } = useGetSubscriptionPlans();

  const pricingPlans = serverPlans.map(plan => ({
    id: plan._id,
    name: plan.name,
    price: plan.price,
    durationInDays: plan.durationInDays,
    description: plan.description,
    features: [
      `${plan.tokenCredits} ${localize('com_nav_subscription_token')}`,
      `${plan.durationInDays} ${localize('com_nav_subscription_days')}`,
      ...plan.features,
    ],
    tokenCredits: plan.tokenCredits,
    buttonLabel: localize('com_nav_select_plan'),
  }));

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent
        title={localize('com_nav_subscription')}
        className="w-11/12 overflow-x-auto bg-background text-text-primary shadow-2xl rtl:mr-1"
      >
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_nav_subscription')}</OGDialogTitle>
        </OGDialogHeader>
        {isLoading ? (
          <p className="text-center">{localize('com_nav_loading')}</p>
        ) : error ? (
          <p className="text-center text-red-600">{localize('com_nav_error_loading_plans')}</p>
        ) : (
          <SubscriptionDataTable plans={pricingPlans} />
        )}
      </OGDialogContent>
    </OGDialog>
  );
};

export default SubscriptionView;
